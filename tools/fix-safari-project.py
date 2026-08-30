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
    """Keep com.apple.security.network.client ON, and do not "tidy" it away.

    It looks removable: the extension makes no network requests, and every
    other artefact says so. It is not removable. The wrapper app hosts a
    WKWebView, and a sandboxed app embedding WKWebView needs this entitlement
    for WebKit's own content process even when the page is a local file:// URL
    from the bundle. Without it the app launches, the window opens, and the
    web view renders nothing -- no crash, no error, just blank.

    This function exists to put it back, because removing it is the obvious
    wrong move and was made once already.
    """
    n = text.count("ENABLE_OUTGOING_NETWORK_CONNECTIONS = NO;")
    if n == 0:
        report("network entitlement", "on (required by WKWebView)", False)
        return text
    text = text.replace("ENABLE_OUTGOING_NETWORK_CONNECTIONS = NO;",
                        "ENABLE_OUTGOING_NETWORK_CONNECTIONS = YES;")
    report("network entitlement", f"{n} occurrence(s) NO -> YES (WKWebView needs it)", True)
    return text


def fix_deployment_target(text, report):
    """The converter sets the project-level deployment target to whatever SDK
    was current when it ran -- 26.5, in our case -- and the app target inherits
    it. The app gates installation, so that refuses to install on anything
    older, for an extension whose code runs far further back.

    13.3 is the real floor: the manifest uses background.service_worker, which
    is MV3, and Safari 16.4 is the first release to support it. Safari 16.4
    ships with macOS 13.3. It is also the version the no-lookbehind convention
    in content.js targets.
    """
    want = "13.3"
    # Only the project-level values, which the app target inherits. The
    # extension target sets its own (10.14) and is left alone.
    found = sorted({v for v in re.findall(r"MACOSX_DEPLOYMENT_TARGET = ([^;]+);", text)})
    stale = [v for v in found if v not in (want, "10.14")]
    if not stale:
        report("deployment target", f"already {want} (extension keeps 10.14)", False)
        return text
    for value in stale:
        text = text.replace(f"MACOSX_DEPLOYMENT_TARGET = {value};",
                            f"MACOSX_DEPLOYMENT_TARGET = {want};")
    report("deployment target", f"{', '.join(stale)} -> {want}", True)
    return text


def fix_app_category(text, report):
    """The Mac App Store requires a category. Without it the archive builds
    with a warning and App Store Connect has nothing to file the app under."""
    key = "INFOPLIST_KEY_LSApplicationCategoryType"
    want = "public.app-category.utilities"
    if key in text:
        report("app category", "already set", False)
        return text
    # Add alongside the app target's other settings, identified by the setting
    # the converter only puts on the app.
    anchor = "ENABLE_OUTGOING_NETWORK_CONNECTIONS = NO;"
    n = text.count(anchor)
    if n == 0:
        raise SystemExit("cannot locate the app target's build settings "
                         "(run the network entitlement fix first)")
    text = text.replace(anchor, f"{anchor}\n\t\t\t\t{key} = \"{want}\";")
    report("app category", f"set to {want} ({n} config(s))", True)
    return text


FIXES = (fix_bundle_identifier, fix_marketing_version, fix_network_entitlement,
         fix_deployment_target, fix_app_category)


def bump_build(text, report):
    """Increment CURRENT_PROJECT_VERSION -- the build number.

    Not part of FIXES, because it changes state rather than restoring it. Run
    it before each archive, with --bump-build.

    Two reasons it matters. App Store Connect refuses a second upload with the
    same version AND build number, so a rejected 1.0.1 cannot be fixed and
    re-uploaded until this moves. And archives are named by timestamp, so with
    a constant build number two archives are labelled identically in Organizer
    while containing different code -- which is how a build without the fix in
    it nearly got uploaded.
    """
    found = sorted({v.strip() for v in re.findall(r"CURRENT_PROJECT_VERSION = ([^;]+);", text)})
    if len(found) != 1:
        raise SystemExit(f"expected one build number, found {found}")
    try:
        nxt = int(found[0]) + 1
    except ValueError:
        raise SystemExit(f"build number is not an integer: {found[0]!r}")
    text = text.replace(f"CURRENT_PROJECT_VERSION = {found[0]};",
                        f"CURRENT_PROJECT_VERSION = {nxt};")
    report("build number", f"{found[0]} -> {nxt}", True)
    return text


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", type=Path, default=DEFAULT_PROJECT,
                    help="path to project.pbxproj")
    ap.add_argument("--check", action="store_true",
                    help="report what would change and exit non-zero if anything would")
    ap.add_argument("--bump-build", action="store_true",
                    help="also increment the build number; run before each archive")
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
    if args.bump_build and not args.check:
        text = bump_build(text, report)

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
