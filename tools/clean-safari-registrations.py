#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Remove stale Safari extension registrations left behind by building.

Every `xcodebuild` run ends with RegisterWithLaunchServices, so each build
path registers another copy of the app -- Debug, Release, and the archive's
intermediate copy are three different paths. Safari lists one extension per
registered copy, so the Extensions pane fills up with identical entries, and
the copy you tick is not necessarily the copy you are running. The app then
reports its extension as off while the extension is plainly working.

Unregistering alone is not durable. The .app copies stay in DerivedData, and
LaunchServices re-registers a copy whenever it is rebuilt or relaunched, so
the duplicates come back -- building Release and then hitting Run in Xcode
(which builds Debug) is enough to get two entries again. To leave exactly one
entry for good, the other configuration's product has to come off disk.

Registrations also outlive the bundles they point at, so deleting DerivedData
without unregistering does not clear the list -- that just leaves an entry
with a blank icon. Do both, in that order, which is what --keep does.

    python3 tools/clean-safari-registrations.py --check     # list, change nothing
    python3 tools/clean-safari-registrations.py             # unregister all
    python3 tools/clean-safari-registrations.py --keep Release
                          # unregister all, delete every other configuration's
                          # product, relaunch the kept app so one entry returns

Quit Safari fully afterwards (Cmd-Q), it caches the list.
"""

import argparse
import glob
import os
import re
import shutil
import subprocess
import sys

LSREGISTER = ("/System/Library/Frameworks/CoreServices.framework/Versions/A"
              "/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister")
APP = "Year First.app"
PATH_RE = re.compile(r"^\s*path:\s*(/.*?)(?:\s*\(0x[0-9a-f]+\))?\s*$")
PRODUCTS = os.path.expanduser(
    "~/Library/Developer/Xcode/DerivedData/Year_First-*/Build/Products")


def registered():
    """Paths LaunchServices knows about that belong to this app.

    Parsed line by line rather than with a path regex: these paths contain
    spaces, including inside directory names, so anything matching /\\S+/
    truncates them and silently misses entries.
    """
    dump = subprocess.run([LSREGISTER, "-dump"], capture_output=True, text=True).stdout
    out = []
    for line in dump.splitlines():
        m = PATH_RE.match(line)
        if m and APP in m.group(1):
            out.append(m.group(1))
    return sorted(set(out))


def products():
    """Built .app copies on disk, as {configuration: path}."""
    out = {}
    for root in glob.glob(PRODUCTS):
        for config in sorted(os.listdir(root)):
            app = os.path.join(root, config, APP)
            if os.path.exists(app):
                out[config] = app
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true",
                    help="list registrations and exit non-zero if there are any")
    ap.add_argument("--keep", metavar="CONFIG",
                    help="configuration to keep (e.g. Release): every other "
                         "configuration's build product is deleted so it cannot "
                         "re-register, then the kept app is relaunched")
    args = ap.parse_args()

    built = products()
    paths = registered()

    if paths:
        apps = [p for p in paths if p.endswith(APP)]
        print(f"{len(apps)} app registration(s), {len(paths) - len(apps)} extension:")
        for p in paths:
            print(f"  {'(missing) ' if not os.path.exists(p) else ''}{p}")
    else:
        print("no registrations")

    if built:
        print(f"\n{len(built)} build product(s) on disk:")
        for config, app in built.items():
            print(f"  {config}: {app}")

    if args.check:
        stale = len(built) > 1 or len(paths) > 2
        print("\n--check: " + ("more than one copy -- run without --check"
                               if stale else "one copy, nothing to do"))
        return 1 if stale else 0

    if args.keep and args.keep not in built:
        print(f"\nno {args.keep} product built -- have {sorted(built) or 'none'}",
              file=sys.stderr)
        return 1

    for p in paths:
        subprocess.run([LSREGISTER, "-u", p], capture_output=True)
    left = registered()
    if left:
        print(f"\n{len(left)} still registered -- unexpected:", file=sys.stderr)
        for p in left:
            print(f"  {p}", file=sys.stderr)
        return 1

    if not args.keep:
        print("\nall unregistered. Rebuild to register one, then quit Safari (Cmd-Q).")
        print("Duplicates return on the next build of another configuration; "
              "use --keep to delete those products too.")
        return 0

    for config, app in built.items():
        if config != args.keep:
            shutil.rmtree(os.path.dirname(app))
            print(f"\ndeleted {config} product")

    # The .appex cannot be registered on its own (lsregister -f reports -10811,
    # "not an application"); launching the container registers it.
    subprocess.run(["open", built[args.keep]], check=True)
    print(f"relaunched {args.keep}. Quit Safari fully (Cmd-Q) to refresh its list.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
