#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Drop the duplicate "Year First" rows Xcode leaves in Safari's Extensions pane.

Safari builds that list from **PlugInKit**, not LaunchServices. This is the
trap: `lsregister -dump` also lists every built copy of the app, so it looks
like the right tool, but `lsregister -u` removes entries Safari never reads
and the rows do not move. PlugInKit keeps its own records, one per .appex
path, and Safari shows one row per record.

    pluginkit -m -A -D -i dev.immanuelqrw.year-first.Extension -vvv

is the ground truth; `pluginkit -r <path to .appex>` removes a record.

**Every signed build registers, and there is no way to stop it.** Xcode has
no setting to skip it, so a Debug build adds a row within seconds of
finishing -- restarting Safari does not help, because the row is real. This
is therefore not a one-shot fix but something to run after building.
(Unsigned builds, `CODE_SIGNING_ALLOWED=NO`, register nothing. Worth knowing
before reproducing this: the product lands on disk, no row appears, and it
looks like the bug fixed itself.)

The copy you actually use should live in /Applications, where Xcode cannot
recreate it. Running the extension straight out of DerivedData means Xcode
owns the copy Safari points at, and rebuilds silently swap it underneath you.
Install once with:

    ditto "<DerivedData>/Build/Products/Release/Year First.app" \\
          "/Applications/Year First.app"

Then, with no arguments, this script keeps that install and removes every
build-output record and product:

    python3 tools/clean-safari-registrations.py --check   # what Safari sees
    python3 tools/clean-safari-registrations.py           # keep the install
    python3 tools/clean-safari-registrations.py --keep Debug
                          # while developing: keep a build, drop the rest

Quit Safari fully afterwards (Cmd-Q) -- it caches the list.
"""

import argparse
import glob
import os
import re
import shutil
import subprocess
import sys
import time

EXTENSION_ID = "dev.immanuelqrw.year-first.Extension"
APP = "Year First.app"
INSTALLED = f"/Applications/{APP}"
LSREGISTER = ("/System/Library/Frameworks/CoreServices.framework/Versions/A"
              "/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister")
DERIVED = os.path.expanduser("~/Library/Developer/Xcode/DerivedData/Year_First-*")
ARCHIVES = os.path.expanduser("~/Library/Developer/Xcode/Archives")
PK_PATH_RE = re.compile(r"^\s*Path\s*=\s*(/.*\.appex)\s*$")
LS_PATH_RE = re.compile(r"^\s*path:\s*(/.*?)(?:\s*\(0x[0-9a-f]+\))?\s*$")


def records():
    """Every .appex path PlugInKit has a record for. This is Safari's list."""
    out = subprocess.run(
        ["pluginkit", "-m", "-A", "-D", "-i", EXTENSION_ID, "-vvv"],
        capture_output=True, text=True).stdout
    # Parsed line by line rather than with a path regex: these paths contain
    # spaces, including inside directory names, so /\S+/ truncates them.
    return sorted({m.group(1) for m in map(PK_PATH_RE.match, out.splitlines()) if m})


def launch_services():
    """Copies LaunchServices knows about. Safari ignores these; they are why
    the app shows up repeatedly in Spotlight."""
    dump = subprocess.run([LSREGISTER, "-dump"], capture_output=True, text=True).stdout
    return sorted({m.group(1) for m in map(LS_PATH_RE.match, dump.splitlines())
                   if m and APP in m.group(1)})


def build_products():
    """Built .app copies under DerivedData, as {configuration: path}.

    Index.noindex holds Xcode's indexing build, a separate copy that is not
    registered; it is left alone.
    """
    out = {}
    for root in glob.glob(os.path.join(DERIVED, "Build", "Products")):
        for config in sorted(os.listdir(root)):
            app = os.path.join(root, config, APP)
            if os.path.exists(app):
                out[config] = app
    return out


def under(path, parent):
    return path == parent or path.startswith(parent + os.sep)


def origin(path, built):
    """Where a registered copy came from, as a short label.

    Archiving registers a third copy -- the archive's own -- which used to
    come out as "unknown", saying nothing about what had just been removed.
    Naming the archive makes the post-action's line during an archive read as
    the expected thing rather than as something going wrong.
    """
    if under(path, INSTALLED):
        return "installed"
    for config, app in built.items():
        if under(path, app):
            return f"build:{config}"
    if under(path, ARCHIVES):
        # .../Archives/2026-08-30/Year First 1.0.2 (2).xcarchive/Products/...
        rest = path[len(ARCHIVES) + 1:].split(os.sep)
        name = next((p for p in rest if p.endswith(".xcarchive")), None)
        return f"archive:{name[:-len('.xcarchive')]}" if name else "archive"
    if any(under(path, os.path.dirname(root)) for root in glob.glob(DERIVED)):
        # Index.noindex and other build trees Xcode keeps outside Products.
        return "build:other"
    return "unknown"


def post_action(args) -> int:
    """Poll for the row this build is about to add, then remove it.

    Always returns 0. Xcode reports a non-zero post-action as a build failure,
    and a duplicate row in Safari is not worth failing a build over.
    """
    keep = f"build:{args.keep}" if args.keep else "installed"
    deadline = time.monotonic() + args.wait
    while True:
        built = build_products()
        extra = [p for p in records() if origin(p, built) != keep]
        if extra or time.monotonic() >= deadline:
            break
        time.sleep(0.5)

    if not extra:
        print(f"year-first: no duplicate row within {args.wait:g}s")
        return 0
    if not any(origin(p, built) == keep for p in records()):
        print(f"year-first: nothing registered for {keep}; leaving "
              f"{len(extra)} row(s) alone rather than emptying the pane")
        return 0

    # Records only. The build product belongs to the build that just made it;
    # deleting it here would pull the app out from under a Run action.
    for p in extra:
        subprocess.run(["pluginkit", "-r", p], capture_output=True)
        print(f"year-first: removed {origin(p, built)} row")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true",
                    help="report and exit non-zero if Safari would show duplicates")
    ap.add_argument("--keep", metavar="CONFIG",
                    help="keep this build configuration instead of the "
                         "/Applications install (for active development)")
    ap.add_argument("--records-only", action="store_true",
                    help="remove PlugInKit records but leave build products on "
                         "disk (for running from inside a build)")
    ap.add_argument("--wait", type=float, default=0, metavar="SECONDS",
                    help="poll up to SECONDS for a duplicate row to appear, and "
                         "treat finding none as success. A build registers its "
                         ".appex a moment after it finishes, so a post-action "
                         "that does not wait runs too early to see its own row.")
    args = ap.parse_args()

    if args.wait:
        return post_action(args)

    built = build_products()
    recs = records()
    keep = f"build:{args.keep}" if args.keep else "installed"

    print(f"Safari would show {len(recs) or 0} row(s):")
    for p in recs:
        print(f"  {origin(p, built):16} {p}")
    if not recs:
        print("  (none)")
    if built:
        print("\nbuild products on disk:")
        for config, app in built.items():
            print(f"  {config}: {app}")

    if args.check:
        dupes = len(recs) > 1
        print("\n--check: " + ("duplicates -- run without --check"
                               if dupes else "one row, nothing to do"))
        return 1 if dupes else 0

    # Refuse before touching anything if what we are told to keep is not there:
    # better to leave duplicates than to leave the pane empty.
    if keep not in {origin(p, built) for p in recs}:
        have = sorted({origin(p, built) for p in recs}) or ["nothing registered"]
        print(f"\nnothing registered for {keep} -- have {have}", file=sys.stderr)
        if keep == "installed" and not os.path.exists(INSTALLED):
            print(f"install it first:\n  ditto <build>/{APP} {INSTALLED!r}", file=sys.stderr)
        return 1

    # Remove the record before the product. The other order leaves a record
    # pointing at nothing, which Safari still renders as a row.
    for p in recs:
        if origin(p, built) != keep:
            subprocess.run(["pluginkit", "-r", p], capture_output=True)
            print(f"\nremoved record: {p}")

    if not args.records_only:
        for p in launch_services():
            if origin(p + "/x", built) != keep and not p.startswith(INSTALLED):
                subprocess.run([LSREGISTER, "-u", p], capture_output=True)

        for config, app in built.items():
            if f"build:{config}" != keep:
                shutil.rmtree(os.path.dirname(app))
                print(f"deleted {config} product")

    left = records()
    if len(left) != 1:
        print(f"\nexpected 1 row, found {len(left)}:", file=sys.stderr)
        for p in left:
            print(f"  {p}", file=sys.stderr)
        return 1

    print(f"\n1 row left ({origin(left[0], built)}). Quit Safari fully (Cmd-Q).")
    print("The next signed build adds a row back -- rerun this afterwards.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
