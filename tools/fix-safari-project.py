#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Apply the fixes a freshly converted Safari Xcode project needs.

`safari-web-extension-converter` produces a project with three problems. One
breaks the build loudly; the other two ship quietly, which is worse. The
project is not in version control, so regenerating it loses all three and
there is nothing to diff against. This script puts them back.

    python3 tools/fix-safari-project.py --check    # report, change nothing
    python3 tools/fix-safari-project.py            # apply

Idempotent: applying twice changes nothing the second time.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PROJECT = Path.home() / "Developer/YearFirst-Safari/Year First/Year First.xcodeproj/project.pbxproj"

BUNDLE_RE = re.compile(r'PRODUCT_BUNDLE_IDENTIFIER = "([^"]+)";')


def manifest_version() -> str:
    return json.loads((ROOT / "manifest.base.json").read_text())["version"]


def fix_bundle_identifier(text, report):
    """The app id must prefix the extension id, or Xcode refuses to embed it.

    The converter derives the extension id from --bundle-identifier and the
    app id from --app-name, so "Year First" against year-first gives
    dev.immanuelqrw.Year-First and dev.immanuelqrw.year-first.Extension --
    which do not match. Lower the app to the extension's stem rather than
    raising the extension, because ViewController.swift hardcodes the
    extension id and lowering the app leaves that correct.
    """
    ids = set(BUNDLE_RE.findall(text))
    ext = [i for i in ids if i.endswith(".Extension")]
    if len(ext) != 1:
        raise SystemExit(f"expected exactly one .Extension bundle id, found {sorted(ids)}")
    want_app = ext[0][: -len(".Extension")]

    app_ids = ids - set(ext)
    if app_ids == {want_app}:
        report("bundle identifier", f"already {want_app}", False)
        return text
    if len(app_ids) != 1:
        raise SystemExit(f"expected one app bundle id, found {sorted(app_ids)}")

    wrong = app_ids.pop()
    text = text.replace(f'PRODUCT_BUNDLE_IDENTIFIER = "{wrong}";',
                        f'PRODUCT_BUNDLE_IDENTIFIER = "{want_app}";')
    report("bundle identifier", f"{wrong} -> {want_app}", True)
    return text


def fix_marketing_version(text, report):
    """MARKETING_VERSION is set once at generation and never follows the
    manifest. The App Store record follows the app wrapper, so a stale value
    here is the version Apple publishes."""
    want = manifest_version()
    found = set(re.findall(r"MARKETING_VERSION = ([^;]+);", text))
    if not found:
        raise SystemExit("no MARKETING_VERSION in the project")
    if found == {want}:
        report("marketing version", f"already {want}", False)
        return text
    for value in found:
        text = text.replace(f"MARKETING_VERSION = {value};", f"MARKETING_VERSION = {want};")
    report("marketing version", f"{', '.join(sorted(found))} -> {want}", True)
    return text


def fix_network_entitlement(text, report):
    """The converter grants com.apple.security.network.client to the app. This
    extension makes no network requests, and every other artefact says so."""
    n = text.count("ENABLE_OUTGOING_NETWORK_CONNECTIONS = YES;")
    if n == 0:
        report("network entitlement", "already off", False)
        return text
    text = text.replace("ENABLE_OUTGOING_NETWORK_CONNECTIONS = YES;",
                        "ENABLE_OUTGOING_NETWORK_CONNECTIONS = NO;")
    report("network entitlement", f"{n} occurrence(s) YES -> NO", True)
    return text


FIXES = (fix_bundle_identifier, fix_marketing_version, fix_network_entitlement)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", type=Path, default=DEFAULT_PROJECT,
                    help="path to project.pbxproj")
    ap.add_argument("--check", action="store_true",
                    help="report what would change and exit non-zero if anything would")
    args = ap.parse_args()

    if not args.project.is_file():
        print(f"not found: {args.project}", file=sys.stderr)
        print("generate it first -- see PLAN.md task 4 for the converter invocation",
              file=sys.stderr)
        return 2

    original = args.project.read_text()
    changed_any = []

    def report(name, detail, changed):
        changed_any.append(changed)
        mark = "FIX " if changed else "ok  "
        print(f"  {mark}{name:22} {detail}")

    text = original
    for fix in FIXES:
        text = fix(text, report)

    if not any(changed_any):
        print("nothing to do")
        return 0

    if args.check:
        print("\n--check: the project needs fixes (run without --check to apply)")
        return 1

    args.project.write_text(text)

    # Re-read and re-run rather than trusting the write.
    verify = args.project.read_text()
    for fix in FIXES:
        fix(verify, lambda *a: None)
    if verify != text:
        raise SystemExit("verification failed: file on disk differs from what was written")
    print(f"\nwritten: {args.project}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
