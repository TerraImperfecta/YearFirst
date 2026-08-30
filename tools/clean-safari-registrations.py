#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Remove stale Safari extension registrations left behind by building.

Every `xcodebuild` run ends with RegisterWithLaunchServices, so each build
path registers another copy of the app -- Debug, Release, and the archive's
intermediate copy are three different paths. Safari lists one extension per
registered copy, so the Extensions pane fills up with identical entries, and
the copy you tick is not necessarily the copy you are running. The app then
reports its extension as off while the extension is plainly working.

Registrations outlive the bundles they point at, so deleting DerivedData does
not clear them -- that just leaves an entry with a blank icon.

    python3 tools/clean-safari-registrations.py --check   # list, change nothing
    python3 tools/clean-safari-registrations.py           # unregister all

Unregistering all is the right move: the next build re-registers exactly one.
Quit Safari fully afterwards, it caches the list.
"""

import argparse
import re
import subprocess
import sys

LSREGISTER = ("/System/Library/Frameworks/CoreServices.framework/Versions/A"
              "/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister")
APP = "Year First.app"
PATH_RE = re.compile(r"^\s*path:\s*(/.*?)(?:\s*\(0x[0-9a-f]+\))?\s*$")


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


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true",
                    help="list registrations and exit non-zero if there are any")
    args = ap.parse_args()

    paths = registered()
    if not paths:
        print("no registrations -- Safari should show one entry after the next build")
        return 0

    apps = [p for p in paths if p.endswith(APP)]
    print(f"{len(apps)} app registration(s), {len(paths) - len(apps)} extension:")
    for p in paths:
        print(f"  {'(missing) ' if not __import__('os').path.exists(p) else ''}{p}")

    if args.check:
        print("\n--check: run without it to unregister these")
        return 1

    for p in paths:
        subprocess.run([LSREGISTER, "-u", p], capture_output=True)
    left = registered()
    if left:
        print(f"\n{len(left)} still registered -- unexpected:", file=sys.stderr)
        for p in left:
            print(f"  {p}", file=sys.stderr)
        return 1
    print("\nall unregistered. Rebuild to register one, then quit Safari fully (Cmd-Q).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
