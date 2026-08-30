#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build Year First for Firefox, Chrome and Safari.

Everything in src/ is shared verbatim. The only thing that differs between
browsers is the manifest, so each target below is a patch applied to
manifest.base.json.

    python3 build.py              # build all three into dist/
    python3 build.py chrome       # build one
    python3 build.py --zip        # also produce dist/*.zip for the stores
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
BASE = ROOT / "manifest.base.json"

# Dual licensed, by distribution channel rather than by recipient choice.
# GPL-3.0 everywhere except Safari: Apple's App Store terms impose usage
# restrictions on users that GPLv3 section 10 forbids adding, so a GPLv3 build
# cannot be distributed there. MPL-2.0 is weak copyleft and carries no such
# conflict. See the licensing section of README.md.
LICENSES = {
    "firefox": ("LICENSE", "GPL-3.0-or-later"),
    "chrome": ("LICENSE", "GPL-3.0-or-later"),
    "safari": ("LICENSE.MPL", "MPL-2.0"),
}
DEFAULT_SPDX = "GPL-3.0-or-later"

TARGETS = {
    # Firefox runs the background script as an event page and needs an
    # explicit add-on ID for storage.sync.
    "firefox": {
        "background": {"scripts": ["background.js"]},
        "browser_specific_settings": {
            "gecko": {
                "id": "year-first@immanuelqrw.dev",
                "strict_min_version": "115.0",
            }
        },
    },
    # Chrome (and Edge, Brave, Opera, Vivaldi) requires a service worker.
    "chrome": {
        "background": {"service_worker": "background.js"},
    },
    # Safari takes the Chrome shape. The converter warns about anything it
    # doesn't recognise, so no Firefox-only keys here.
    "safari": {
        "background": {"service_worker": "background.js"},
    },
}


def build(target: str, make_zip: bool) -> Path:
    manifest = json.loads(BASE.read_text())
    manifest.update(TARGETS[target])

    out = DIST / target
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(SRC, out, ignore=shutil.ignore_patterns("make_icons.py", "*.pyc", "__pycache__"))
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    # GPL-3.0 requires the licence text to accompany the distributed work, and
    # what gets distributed is this folder (and the zip made from it), not the
    # repository.
    licence_file, spdx = LICENSES[target]
    shutil.copy2(ROOT / licence_file, out / "LICENSE")

    # The sources carry the default identifier; retag them for targets that
    # ship under the other licence, so a reader of the shipped file is not
    # told something the accompanying LICENSE contradicts.
    if spdx != DEFAULT_SPDX:
        for js in out.rglob("*.js"):
            text = js.read_text()
            if DEFAULT_SPDX in text:
                js.write_text(text.replace(
                    f"SPDX-License-Identifier: {DEFAULT_SPDX}",
                    f"SPDX-License-Identifier: {spdx}"))

    files = sum(1 for p in out.rglob("*") if p.is_file())
    print(f"{target:8} -> {out.relative_to(ROOT)}  ({files} files, {spdx})")

    if make_zip:
        archive = shutil.make_archive(str(DIST / f"year-first-{target}"), "zip", out)
        print(f"{'':8}    {Path(archive).relative_to(ROOT)}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="*", choices=[*TARGETS, []], help="default: all")
    ap.add_argument("--zip", action="store_true", help="also write a zip per target")
    args = ap.parse_args()

    if not SRC.is_dir():
        print("src/ not found — run this from the extension folder", file=sys.stderr)
        return 1

    DIST.mkdir(exist_ok=True)
    for target in args.targets or TARGETS:
        build(target, args.zip)

    print("\nLoad it:")
    print("  Firefox  about:debugging#/runtime/this-firefox -> Load Temporary Add-on -> dist/firefox/manifest.json")
    print("  Chrome   chrome://extensions -> Developer mode -> Load unpacked -> dist/chrome")
    print("  Safari   xcrun safari-web-extension-converter dist/safari")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
