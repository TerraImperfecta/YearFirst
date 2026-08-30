# Year First — handoff plan

Context for picking this up cold. Read `README.md` first for what the thing
does and how to run it; this file covers what's decided, what's left, and
what must not be undone.

## What it is

A browser extension that rewrites every date on a page to `YYYY-MM-DD`.
Vanilla JS, no dependencies, no build step beyond copying files and patching
a manifest. Targets Firefox, Chrome and Safari from one source tree.

## Where it stands

Working and tested by hand in Firefox: date matching, the MutationObserver
path for content added after load, the toolbar popup, the options page, the
icon set, and the three-target build. Firefox is the only browser it has
actually been loaded in.

All three builds are now verified by hand.

Firefox was the development target throughout. Chrome was loaded unpacked and
needed no changes. Safari was converted, built in Xcode and run: dates
rewrite, the MutationObserver path works, the popup, options page, badge and
settings persistence all behave. The only fixes Safari needed were to the
manifest patch and the generated project, never to `src/`.

The DOM side is now covered too, by two harnesses that catch different
things. `test/dom.test.js` drives the real content script inside jsdom and
asserts on the resulting document -- black box, since content.js exports
nothing. `test/test.html` checks itself in a real browser.

They are not redundant. jsdom does not implement `isContentEditable`, so the
contenteditable skip cannot be tested there at all -- an assertion would be
testing jsdom rather than the extension. The browser page covers it. Run both
before believing the DOM side works.

Automated tests now cover the matching logic: 45 cases in
`test/dates.test.js`, run with `node --test`, no dependencies. That closes
what was the biggest hole. The DOM side (TreeWalker, MutationObserver,
rewriting) is still only verified by hand against `test/test.html`.

## Layout

```
manifest.base.json   keys shared by every browser
build.py             applies a per-browser patch, writes dist/<target>/
src/                 the extension — identical across all three browsers
  content.js         the whole product: find dates, rewrite them, watch for more
  background.js      badge on the toolbar icon when rewriting is off
  popup.html/.js     toolbar popup
  options.html/.js   full settings
  icons/             PNGs + icon.svg + make_icons.py
test/test.html       manual test page, served over http
test/dates.test.js   regression tests for the matching logic (node --test)
dist/                build output, one loadable folder per browser
.github/workflows/   CI (tests + dist/ drift check) and tagged releases
```

`build.py` is the only thing that differs per browser. If a change needs a
per-browser conditional in `src/`, that is a signal something is wrong —
push the difference into the manifest patch instead.

## How content.js works

1. Read settings from `storage.sync`, defaults in `DEFAULTS` at the top.
2. Decide day-first vs month-first. `numericOrder: "auto"` scans the page
   text for numeric dates with a component over 12 (unambiguous either way)
   and lets them vote; ties fall back to the page's `lang`, then
   `navigator.language`.
3. `rewriteTimeElements` handles `<time datetime>` first — the attribute is
   machine-readable, so it beats guessing from text.
4. A TreeWalker collects text nodes, skipping `SKIP_TAGS`, contenteditable
   subtrees, and anything under `[data-no-year-first]`. `isSkipped` caches
   per element in a WeakMap.
5. `findDates(text, opts)` runs each pattern over the *original* string,
   collects `{start, end, value, raw}`, sorts by position with longest-wins,
   and drops overlaps. This is the only place that needs testing seriously.
6. `rewriteTextNode` either swaps `nodeValue` (when both appearance options
   are off) or builds a fragment of `<span class="year-first-date">`.
7. A MutationObserver queues added nodes and character-data changes, flushes
   on idle, then calls `observer.takeRecords()` to discard the mutations the
   rewrite itself just caused. The transform is idempotent, so a missed
   record is harmless.

## Decisions that must not be silently reverted

**No lookbehind assertions.** The numeric patterns capture the character
before the date as group 1 and hand it back untouched. This looks like it
wants to be `(?<![\d\-/.])`. It did use that, and it was changed on purpose:
JavaScriptCore only gained lookbehind in Safari 16.4, and a regex literal
that fails to parse takes down the entire content script silently at load.
If you touch the numeric patterns, keep the group-1 offset convention and
the `add(m, value, offset)` signature.

**Two-digit years only match with slashes.** `3/4/25` matches; `1.2.3` must
not. Dotted separators with a short year would eat every semantic version
string on the web. Years 00–68 map to 2000s, 69–99 to 1900s.

**`1.2.2024` is knowingly ambiguous** — a valid German date and a plausible
version string. It gets rewritten unless it sits inside a code element.
Accepted, not a bug.

**Plain-text replacement is the safe path.** Wrapping dates in a `<span>` is
what makes tooltips and underlining possible, but extra elements inside a
framework-managed DOM can break re-rendering on some sites. Both appearance
options default to on; if a site misbehaves the fix is turning them off, not
removing the plain path.

**Matches that would not change the text are dropped before rewriting.**
`rewriteTextNode` filters `d.value !== d.raw`. This looks like an
optimisation and is not. Without it, `rewriteTimeElements` sets a `<time>`
element's text to the ISO value, and the TreeWalker pass immediately after
treats that as a plain date and wraps it in a nested span. The span covers the
text, so its title wins on hover and the user sees the new date instead of the
original the element's own title was holding. It also stops a date already
written as `YYYY-MM-DD` collecting a span, an underline and a tooltip that
repeats what is on screen. Found on nodejs.org, where all 48 dates are `<time>`
elements.

**The on-page underline uses `currentColor`, not the brand amber.** An amber
dotted underline under a date is indistinguishable from a spellcheck
squiggle. Do not "fix" this to match the accent.

**The UI accent is not the tile colour.** Tile is `#B8730E`; the accent in
popup and options is `#9a5e0a` light / `#e9a93c` dark, because white text on
the tile amber falls just under 4.5:1.

**Icon small sizes are hand-tuned, not scaled.** `make_icons.py` has `FULL`
(three nested squares, 48px and up) and `SIMPLE` (middle square dropped,
strokes thickened, 32px and down). Three nested outlines smear at 16px.

**Pillow strokes inward, SVG strokes centred.** `icon.svg` coordinates are
inset by half the stroke width relative to the `make_icons.py` boxes. They
are supposed to differ by that amount. This has been got wrong once already.

**The mark is offset, not concentric.** Concentric rounded squares with a
round core is the Instagram glyph. The bottom-right gaps are roughly a
quarter of the top-left gaps, on purpose.

## Tasks, in order

### 1. Regression tests for the date logic — DONE

Landed as `test/dates.test.js`. The corpus below is kept as the record of
what is covered. `findDates` and its helpers are pure functions over strings,
so they need no DOM.

The tests slice the pure section out of `content.js` and evaluate it, bounded
by string markers rather than line numbers — so editing `content.js` moves the
boundaries with it, and a missing marker fails the run instead of silently
testing the wrong range. `content.js` itself is untouched and still ships as
one self-contained IIFE.

CI runs these on every PR, alongside a check that `dist/` still matches a
fresh build. That second job matters because `dist/` is committed and the
README promises it is loadable without building.

Extract the patterns and helpers (`MONTHS` through `findDates`, currently
lines ~25–167 of `content.js`) into something importable without breaking
the content script, which must stay a single IIFE with no module syntax —
Firefox content scripts are not modules. Options: a small build-time
concatenation, or `test/dates.test.js` that reads `content.js`, slices out
the section, and evals it. The slicing approach is ugly but was what worked
during development; a cleaner split is welcome as long as `src/content.js`
ships as one self-contained file.

Run with `node --test`, no dependencies. Corpus (`dayFirst` is the resolved
boolean, not the raw setting):

| input | dayFirst | expect |
| --- | --- | --- |
| `Published on January 5, 2024 by the committee.` | either | 2024-01-05 |
| `Filed Jan. 5, 2024 in the district court.` | either | 2024-01-05 |
| `Due March 3rd, 2021 at the latest.` | either | 2021-03-03 |
| `Signed 5 January 2024 in Geneva.` | either | 2024-01-05 |
| `The 22nd of September, 1998 was a Tuesday.` | either | 1998-09-22 |
| `Reissued 7 Sept 2019 without changes.` | either | 2019-09-07 |
| `Invoice dated 23/07/2024, payable in 30 days.` | true | 2024-07-23 |
| `Meeting moved to 05/01/2024.` | true | 2024-01-05 |
| `Meeting moved to 05/01/2024.` | false | 2024-05-01 |
| `Contract start 1-6-2024, end 31-12-2024.` | true | 2024-06-01, 2024-12-31 |
| `Stamped 05.01.2024 at the border.` | true | 2024-01-05 |
| `Receipt: 3/4/25, no refunds.` | true | 2025-04-03 |
| `Already tidy: 2024-1-5 needs padding.` | either | 2024-01-05 |
| `Log line 2024/03/09 14:02 UTC.` | either | 2024-03-09 |
| `At 2024-03-09T14:02:11Z exactly.` | either | 2024-03-09, time untouched |
| `5/1/2024,3/4/2025 and 7/8/2026.` | true | all three, adjacent matches |
| `23/07/2024 is the date` | true | matches at string start |

Must come back unchanged, under both `dayFirst` values:

`Semantic version 2.5.1 and a ratio of 3/4.` ·
`Not a real date: 31/02/2024.` ·
`Phone extension 555 12 2024, order #05012024.` ·
`Sum 1/2 + 1/2 = 1` · `Range 2020-2024 was busy.` ·
`id 05/01/2024/99 and 2024-05-01-07` (longer numeric runs)

Also cover: `convertMonthYear` on turns `Shipping in March 2024.` into
`2024-03` and off leaves it alone; a guard asserting no lookbehind
(`/\(\?<[=!]/`) appears anywhere in `src/`.

### 2. Load the Chrome build — DONE

Loaded unpacked from `dist/chrome`. Service worker starts with a clean
console, dates rewrite, the "Add three more dates" button confirms the
MutationObserver path, the "off" badge appears, and settings survive an
extension reload. Nothing needed fixing — the one-line manifest patch from
`background.scripts` to `background.service_worker` was sufficient.

If this ever regresses, fix it in `build.py`'s chrome patch, not in `src/`.

### 3. Per-site disable — DONE

Built as designed below. `disabledHosts` is a list of hosts in
`storage.sync`, checked in `start()` before anything happens. The popup shows
an "Off on <host>" row when the active tab is http(s), writes the host and
reloads, matching how the master switch already behaves. `activeTab` supplies
the URL, so no new permission was needed.

Two details worth keeping. It matches on HOST -- hostname plus port -- rather
than origin or bare hostname. Origin would split `http://example.com` from
`https://example.com`, which is not how anyone thinks about "this site" and
is not what the popup row says, since the row shows the host. Bare hostname
would go too far the other way and merge `localhost:3000` with
`localhost:8000`, which really are different sites. Tests assert both edges.

And `disabledHosts` is a separate key from `enabled`, so turning a site back
on cannot silently flip the master switch.

Not built: a way to review or clear the list from the options page. Today the
only way to re-enable a site is to open the popup on it. That is discoverable
enough for now, but it is the obvious follow-up.

The original design notes follow.

The most likely thing to be missed in daily use — sites where the original
date string matters, like code review tools. Design notes: store a list of
disabled origins in `storage.sync`; check it in `start()` before doing
anything; add a row to the popup ("Off on example.com") that writes the
current tab's origin and reloads, matching how the master switch already
behaves. The popup already has `activeTab`, so the origin is available from
`tabs.query` without new permissions. Keep the storage key separate from the
global `enabled` flag so the two don't fight.

### 4. Safari — DONE (built and run; not yet distributed)

Licensing is settled: this target ships MPL-2.0, handled by `build.py`. No
action needed beyond not undoing it.

The conversion runs clean. The exact invocation, which is worth reusing:

```
xcrun safari-web-extension-converter dist/safari \
  --macos-only \
  --project-location ~/Developer/YearFirst-Safari \
  --app-name "Year First" \
  --bundle-identifier dev.immanuelqrw.year-first \
  --swift --no-open --no-prompt
```

`--copy-resources` is deliberately omitted, so the project REFERENCES
`dist/safari/` rather than copying it — `python3 build.py safari` then updates
what the app loads, without regenerating the project. Add `--copy-resources`
for a release build, so the project stands alone.

Generated outside the repo on purpose. An Xcode project is a large pile of
files that should not be committed, and there is no .gitignore to catch it.

**The generated project does not build as-is.** Xcode fails with:

    Embedded binary's bundle identifier is not prefixed with the parent
    app's bundle identifier.

The converter derives the two identifiers from different inputs. The
extension's comes from `--bundle-identifier`; the app's comes from
`--app-name`, sanitised and appended to the bundle identifier's prefix. Pass
an app name whose sanitised form differs in case from the last component of
the bundle identifier -- "Year First" against `year-first` -- and they do not
match:

    app        dev.immanuelqrw.Year-First
    extension  dev.immanuelqrw.year-first.Extension

Fix by lowering the app's identifier to match, in
`Year First.xcodeproj/project.pbxproj` (two occurrences of
`PRODUCT_BUNDLE_IDENTIFIER`):

    dev.immanuelqrw.Year-First  ->  dev.immanuelqrw.year-first

Lower the app rather than raise the extension: `ViewController.swift`
hardcodes the lowercase extension identifier, so lowering the app leaves that
correct and touches nothing else. After the edit, `xcodebuild` reaches
ValidateEmbeddedBinary and succeeds.

This recurs on every regeneration, so redo the edit or pass
`--bundle-identifier dev.immanuelqrw.Year-First` instead and accept the
capitalised identifier. The lowercase one is more conventional and the
identifier is permanent once shipped, which is why the edit is preferred.

Converting emitted one warning, now fixed at the source rather than ignored:
Safari does not support `options_ui.open_in_tab`, so `build.py` drops that key
for the safari target only. It was `false`, which is Safari's only behaviour
anyway, so nothing changed but the warning.

Verified working: built in Xcode, enabled through
Develop → Allow Unsigned Extensions, and run against `test/test.html` served
over http. Dates rewrite, the MutationObserver path works, and the popup,
options page, badge and settings persistence all behave.

Both things this plan flagged as uncertain turned out fine. `setBadgeText`
does work on Safari -- the try/catch around it stays anyway, since it costs
nothing and the popup showing true state is the real guarantee. The options
page behaves despite Safari surfacing it through the app rather than inline.

To run it again after a Safari restart, redo Develop → Allow Unsigned
Extensions; that setting does not persist.

Distribution is a separate job: Apple Developer Program at $99/year, code
signing, and an App Store Connect record. Note that is an APP listing, not an
extension listing — it needs its own screenshots and description, distinct
from the copy in STORE-NOTES.md.
Needs Safari → Settings → Advanced → show developer features, then
Develop → Allow Unsigned Extensions, which resets on every Safari restart.
Two things to check rather than assume: whether `action.setBadgeText` does
anything (it is already wrapped in try/catch, so worst case is a missing
badge and the popup still shows true state), and whether the popup opens
reliably if the iOS target is built — `--macos-only` avoids that for now.

### 5. Release prep

- ~~Replace the placeholder add-on ID.~~ DONE — now
  `year-first@immanuelqrw.dev`. It was worth doing first: the ID keys
  `storage.sync`, so changing it after release silently resets everyone's
  settings.
- ~~Add a LICENSE and a CHANGELOG.~~ DONE — GPL-3.0, plus `CHANGELOG.md`.
- ~~Write the data-collection declaration.~~ DONE — drafted in
  `STORE-NOTES.md`, along with the `<all_urls>` justification every store
  asks for. The answer is none, and it is verifiable from source: no network
  calls, no eval, no remote code, no identifiers.
- ~~GPL-3.0 conflicts with the Apple App Store.~~ RESOLVED — dual licensed
  by channel. GPL-3.0-or-later for Firefox, Chrome and this repository;
  MPL-2.0 for the Safari build only, because Apple's terms impose usage
  restrictions that GPLv3 section 10 forbids adding downstream. `build.py`
  ships the right text per target and retags the sources; a test asserts it.
  Note the knock-on: the Safari build is readable JS under MPL, so anyone may
  take that copy into a closed product. The GPL on the other builds does not
  prevent that. Accepted deliberately, not overlooked.
- Still to do: screenshots and listing copy for all three stores.
- `python3 build.py --zip` produces the store uploads.
- Costs: Firefox signing free (self-distribution allowed), Chrome $5 once,
  Safari $99/year plus shipping inside a native app.

## Out of scope unless asked

Shadow DOM (GitHub's `<relative-time>` and similar are unreachable from a
content script without per-site hacks). Non-English month names — the
`MONTHS` map is trivially extensible but nobody has asked. Relative
expressions in plain text ("three weeks ago") with no `<time>` element to
anchor them. Time-of-day normalisation; this is a date tool.

## Environment

**The extension ships no dependencies and that is not negotiable.** `build.py`
copies `src/` alone, so `dist/` and the store zips contain nothing but the
extension. No bundler, no minification, nothing to audit.

The test harness is the exception, and it is deliberate: jsdom is a
devDependency, because the DOM side is untestable without a DOM and a
hand-rolled shim would mean tests that validate the shim rather than the code.
`npm ci` in CI, `node_modules/` gitignored, nothing reaching the built output.

Python 3 for `build.py`, plus Pillow only if regenerating icons. Node 24+ for
tests -- `node --test test/` fails on 24, so use `npm test`, which passes the
files explicitly.

```
npm ci                        # once, for the test harness
npm test                      # 75 tests: dates, DOM, licensing
python3 build.py              # all three targets into dist/
python3 build.py chrome       # one target
python3 build.py --zip        # store-ready zips
cd test && python3 -m http.server 8000   # then open localhost:8000/test.html
```

The test page checks itself: let it settle, then press **Check results**. It
reports pass or fail per row and says why when a row fails. Press
**Add three more dates** first to exercise the MutationObserver, then check
again.

Firefox and Safari do not run content scripts on `file://` URLs, which is
why the test page has to be served.
