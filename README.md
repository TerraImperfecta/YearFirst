# Year First

A browser extension that rewrites every date on a page to `YYYY-MM-DD`.
Builds for Firefox, Chrome and Safari from one source folder.

The name is the rule: the largest unit leads, so dates sort as strings
and `05/01` stops being an argument.

```
January 5, 2024   ->  2024-01-05
5 Jan 2024        ->  2024-01-05
23/07/2024        ->  2024-07-23
2024/3/9          ->  2024-03-09
3/4/25            ->  2025-04-03
<time datetime="2023-11-14">three years ago</time>  ->  2023-11-14
```

See `PLAN.md` for outstanding work and the decisions behind the code.

## Layout

```
manifest.base.json   keys shared by every browser
build.py             applies a per-browser patch, writes dist/<target>/
src/                 the extension itself — identical across browsers
  content.js         finds and rewrites dates; watches for content added later
  background.js      puts an "off" badge on the toolbar icon when disabled
  popup.html/.js     toolbar popup: on/off switch and appearance toggles
  options.html/.js   full settings, with a live preview of the ambiguous case
  icons/             PNG set plus the SVG source and make_icons.py
test/test.html       every supported format, and cases that must not change
dist/                build output, one loadable folder per browser
```

Nothing in `src/` is browser-specific. The only difference between targets is
the manifest, which is why the build script is 80 lines rather than a bundler.

## Build

```
python3 build.py              # all three into dist/
python3 build.py chrome       # just one
python3 build.py --zip        # also dist/year-first-<target>.zip for stores
```

Prebuilt output is included, so you can load `dist/` without running anything.

## Install

**Firefox** — `about:debugging#/runtime/this-firefox` -> Load Temporary Add-on
-> pick `dist/firefox/manifest.json`. Lasts until Firefox restarts. Under
Manifest V3 Firefox grants site access per site: click the extensions
(puzzle-piece) button, then the gear next to Year First ->
**Always Allow on This Site**, and reload the page.

**Chrome** (also Edge, Brave, Opera, Vivaldi) — `chrome://extensions` ->
turn on Developer mode -> Load unpacked -> pick the `dist/chrome` folder.
Chrome grants `<all_urls>` at install, so there is no per-site step.

**Safari** — needs macOS with Xcode:

```
xcrun safari-web-extension-converter dist/safari
```

That writes an Xcode project wrapping the extension in a macOS app (add
`--macos-only` to skip the iOS target). Build and run it, then in Safari:
Settings -> Advanced -> Show features for web developers, and
Develop -> Allow Unsigned Extensions. That last setting resets every time
Safari restarts.

## Test

Firefox and Safari don't run content scripts on `file://` URLs, so serve the
test page:

```
cd test && python3 -m http.server 8000
```

Open `http://localhost:8000/test.html`. Each row shows the expected result on
the right, including a section of things that must stay untouched and a button
that injects dates after load to exercise the MutationObserver.

## Toolbar button

Click it for the on/off switch and the two appearance toggles. Switching
rewriting off reloads the current tab, because dates already rewritten stay
rewritten until the page loads again. The appearance toggles offer a reload
rather than forcing one. When rewriting is off the icon carries a grey "off"
badge — Safari may ignore that; the popup always shows the true state.

## Settings

Firefox `about:addons` -> Preferences · Chrome extension card -> Extension
options · Safari Settings -> Extensions -> the app's preferences.

- **Reading 05/01/2024** — day-first, month-first, or worked out per page. The
  automatic mode looks for dates on the page that can only be read one way (a
  part greater than 12) and lets those vote, then falls back to the page's
  `lang` attribute.
- **Timestamps marked up as `<time>`** — uses the machine-readable `datetime`
  attribute, so relative timestamps like "3 hours ago" become real dates.
- **Month and year alone** — off by default, because "may 2024" is often a
  sentence rather than a date.
- **Keep the original text as a tooltip** — on by default. It wraps each date
  in a `<span>`; a few framework-heavy sites object to extra elements, so turn
  it off if a page misbehaves.
- **Underline rewritten dates** — on by default, a dotted underline showing
  what the extension touched.

## Deliberate limits

- Text inside `<input>`, `<textarea>`, `contenteditable`, `<code>`, `<pre>`,
  `<kbd>` and `<samp>` is left alone. Add `data-no-year-first` to any element to
  skip its subtree.
- Two-digit years only match with slashes (`3/4/25`), so version strings like
  `1.2.3` survive. Years 00–68 map to 2000s, 69–99 to 1900s.
- `1.2.2024` is a real German date and a plausible version string. It gets
  rewritten unless it sits in a code element.
- Impossible dates such as `31/02/2024` are ignored.
- The numeric patterns capture the character before the date rather than using
  a lookbehind assertion, which older WebKit can't parse. Keep it that way if
  you care about Safari before 16.4.
- Month names are English only. Extend the `MONTHS` map in `content.js`.
- Dates inside shadow DOM (GitHub's `<relative-time>`, for example) are not
  reached.

## Icons

The mark is three squares nested off-centre, each settling toward the bottom
right — year contains month contains day. The offset is deliberate: concentric
squares with a round core read as a camera lens.

`src/icons/icon.svg` is the vector source; the PNGs are what the manifests
reference. Regenerate with `python3 icons/make_icons.py` from inside `src/`
(needs Pillow).

Sizes are not a mechanical downscale. At 32px and below the script drops the
middle square and thickens the remaining strokes, because hairlines vanish at
that scale — see `SIMPLE` in `make_icons.py`. `BODY` and `MARK` at the top of the
script recolour the whole set — `BODY` is the tile amber `#B8730E`.

The UI accent in `popup.html` and `options.html` is a darker amber
(`#9a5e0a` light, `#e9a93c` dark) rather than the tile colour, because white
text on the tile amber falls just short of the 4.5:1 contrast floor. The
on-page underline deliberately uses `currentColor`, not the accent, so it
never gets mistaken for a spellcheck squiggle.

## Publishing

| | cost | signing |
| --- | --- | --- |
| Firefox | free | AMO signing required, self-distribution allowed |
| Chrome | $5 once | Web Store review |
| Safari | $99/year | ships inside a native app via the App Store |
