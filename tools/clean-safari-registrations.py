#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Remove duplicate "Year First" rows from Safari's Extensions pane.

Safari builds that list from **PlugInKit**, not LaunchServices. This matters,
because the obvious tool is the wrong one: `lsregister -dump` also lists every
built copy of the app, and unregistering them with `lsregister -u` changes
nothing that Safari displays. PlugInKit keeps its own records, one per .appex
path, and Safari shows one row per record -- so Debug and Release are two
rows with the same name and icon, and the one you tick is not necessarily the
one that is running.

Every build registers its .appex with PlugInKit, so the duplicates come back
whenever Xcode builds a configuration you had cleaned up. Removing the record
is therefore only half of it; the .appex has to come off disk too, or the next
build of that configuration re-registers it. If Xcode is open on the project,
expect Debug to return the next time you hit Run.

    python3 tools/clean-safari-registrations.py --check
    python3 tools/clean-safari-registrations.py --keep Release

Quit Safari fully afterwards (Cmd-Q) -- it caches the list.
"""

import argparse
import glob
import os
import re
import shutil
import subprocess
import sys

EXTENSION_ID = "dev.immanuelqrw.year-first.Extension"
APP = "Year First.app"
LSREGISTER = ("/System/Library/Frameworks/CoreServices.framework/Versions/A"
              "/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister")
PRODUCTS = os.path.expanduser(
    "~/Library/Developer/Xcode/DerivedData/Year_First-*/Build/Products")
PLUGINKIT_PATH_RE = re.compile(r"^\s*Path\s*=\s*(/.*\.appex)\s*$")
LS_PATH_RE = re.compile(r"^\s*path:\s*(/.*?)(?:\s*\(0x[0-9a-f]+\))?\s*$")


def records():
    """Every .appex path PlugInKit has a record for. This is Safari's list."""
    out = subprocess.run(
        ["pluginkit", "-m", "-A", "-D", "-i", EXTENSION_ID, "-vvv"],
        capture_output=True, text=True).stdout
    # Parsed line by line rather than with a path regex: these paths contain
    # spaces, including inside directory names, so /\S+/ truncates them.
    return sorted({m.group(1) for m in map(PLUGINKIT_PATH_RE.match, out.splitlines()) if m})


def launch_services():
    """Copies LaunchServices knows about. Secondary -- Safari ignores these,
    but they are why the app shows up repeatedly in Spotlight."""
    dump = subprocess.run([LSREGISTER, "-dump"], capture_output=True, text=True).stdout
    return sorted({m.group(1) for m in map(LS_PATH_RE.match, dump.splitlines())
                   if m and APP in m.group(1)})


def products():
    """Built .app copies on disk, as {configuration: path}."""
    out = {}
    for root in glob.glob(PRODUCTS):
        for config in sorted(os.listdir(root)):
            app = os.path.join(root, config, APP)
            if os.path.exists(app):
                out[config] = app
    return out


def config_of(path, built):
    for config, app in built.items():
        if path.startswith(app + os.sep) or path == app:
            return config
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true",
                    help="report and exit non-zero if Safari would show duplicates")
    ap.add_argument("--keep", metavar="CONFIG",
                    help="configuration to keep (e.g. Release): PlugInKit records "
                         "for every other configuration are removed and their build "
                         "products deleted, then the kept app is relaunched")
    args = ap.parse_args()

    built = products()
    recs = records()

    print(f"Safari would show {len(recs)} row(s) -- PlugInKit records:")
    for p in recs:
        missing = "" if os.path.exists(p) else "(stale) "
        print(f"  {missing}{config_of(p, built) or '?'}: {p}")
    if not recs:
        print("  (none)")

    print(f"\n{len(built)} build product(s) on disk:")
    for config, app in built.items():
        print(f"  {config}: {app}")

    if args.check:
        dupes = len(recs) > 1
        print("\n--check: " + ("duplicates -- run with --keep Release"
                               if dupes else "one row, nothing to do"))
        return 1 if dupes else 0

    if args.keep and args.keep not in built:
        print(f"\nno {args.keep} product built -- have {sorted(built) or 'none'}",
              file=sys.stderr)
        return 1

    # Remove the PlugInKit record first. Doing it after deleting the .appex
    # leaves a stale record pointing at nothing, which Safari still renders.
    doomed = [p for p in recs if config_of(p, built) != args.keep] if args.keep else recs
    for p in doomed:
        subprocess.run(["pluginkit", "-r", p], capture_output=True)

    for p in launch_services():
        if not args.keep or config_of(p, built) != args.keep:
            subprocess.run([LSREGISTER, "-u", p], capture_output=True)

    if not args.keep:
        print(f"\nremoved {len(doomed)} record(s). The next build re-registers the "
              "configuration it builds.")
        return 0

    for config, app in built.items():
        if config != args.keep:
            shutil.rmtree(os.path.dirname(app))
            print(f"\ndeleted {config} product")

    left = records()
    if len(left) != 1:
        print(f"\nexpected 1 record, found {len(left)}:", file=sys.stderr)
        for p in left:
            print(f"  {p}", file=sys.stderr)
        return 1

    print(f"\n1 record left ({args.keep}). Quit Safari fully (Cmd-Q) to refresh it.")
    if subprocess.run(["pgrep", "-qf", "Xcode.app/Contents/MacOS/Xcode"]).returncode == 0:
        print("Xcode is open -- building another configuration brings its row back.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
