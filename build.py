#!/usr/bin/env python3
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

TARGETS = {
    # Firefox runs the background script as an event page and needs an
    # explicit add-on ID for storage.sync.
    "firefox": {
        "background": {"scripts": ["background.js"]},
        "browser_specific_settings": {
            "gecko": {
                "id": "year-first@example.com",
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

    files = sum(1 for p in out.rglob("*") if p.is_file())
    print(f"{target:8} -> {out.relative_to(ROOT)}  ({files} files)")

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
