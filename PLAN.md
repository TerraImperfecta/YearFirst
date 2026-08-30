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

**Switching ON applies in place; switching OFF reloads.** Not symmetric, and
deliberately so. The content script is already on the page, so turning the
extension or a site back on only needs a rewrite -- `year-first:apply` asks
for one. Turning OFF genuinely needs a reload: once a date has been swapped
the original text is gone, and with both appearance options off there is not
even an element left to carry it.

Both directions used to reload, which is what the flash on toggling was. The
popup asks rather than assuming: a page with no content script -- one open
since before the extension was installed -- answers nothing, and the popup
falls back to reloading rather than leaving the page unchanged. `applied` is
false when the setting says stay off, for the same reason.

Note this does NOT cover the flash on an ordinary page load, which is a
different thing: `run_at` is `document_idle`, so a page paints its original
dates and then reflows as they are rewritten. Moving to `document_end` would
narrow that window. Not done -- it changes behaviour on every page, not just
on a toggle, and wants measuring in a real browser first.

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

**A date is only joined across a gap that is entirely whitespace.**
`rewriteRun` matches a run of text nodes as one string, so a date broken
across inline markup is still found -- Wikipedia writes "1 January 1970" as
`1`, a `<span>` holding only a non-breaking space, then `January 1970`. But it
refuses to join when any text node between the first and last holds real
content, because rewriting there would mean deleting the elements that hold
the date. A date split across two links is the case that would break.

This was measured before it was built rather than guessed: on the Unix time
article, 66 unreachable dates were all whitespace gaps and **zero** needed
crossing an element with content. The narrow rule recovers everything at no
risk. Runs also end at a `<br>` and at any block boundary, both of which have
tests -- and the block test needs its trailing space to mean anything, since
without it the concatenation cannot match either way.

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

Built since: a "Sites turned off" list on the options page, with a "Turn back
on" per row and a "Turn all sites back on" once there are two or more. Before
it, re-enabling a site meant navigating to that site first and opening the
popup there -- fine for a site you are looking at, useless for one you turned
off months ago and now cannot name.

Four things it does deliberately:

The rows are BUTTONS, not checkboxes. `options.js` wires every `input` on the
page to `save()`, so a per-host checkbox would fire a full settings write; and
"turn back on" says which way is off, where a tick next to a host name does
not. A test asserts the list contains no inputs, so this cannot be undone by
accident.

Host names go in as `textContent`. The preview block above them uses
`innerHTML`, which is safe there because every part of it is a literal in the
source -- none of the host list is. Tested with a host containing a tag.

It writes `disabledHosts` alone, never as part of `save()`, so the two halves
of the page cannot overwrite each other. Also tested in both directions.

It listens on `storage.onChanged`, because the popup writes the same key and
can be used while this page is open. Without it the list goes stale and
re-enabling a site would write back a list that had already moved on.

Focus is placed after a removal -- the button that had it is gone. It lands on
the row that took its place, on the row above when the bottom one goes, and on
the list itself when the last one goes. The empty case is a separate branch,
which is where the one real bug in this work was: it returned before the focus
code ran, so removing the only row dropped focus to nowhere. Caught by a test
written before the code was.

The original design notes follow.

The most likely thing to be missed in daily use — sites where the original
date string matters, like code review tools. Design notes: store a list of
disabled origins in `storage.sync`; check it in `start()` before doing
anything; add a row to the popup ("Off on example.com") that writes the
current tab's origin and reloads, matching how the master switch already
behaves. The popup already has `activeTab`, so the origin is available from
`tabs.query` without new permissions. Keep the storage key separate from the
global `enabled` flag so the two don't fight.

### 3b. Announce the original date to screen readers — DONE

Rewriting dates is neutral-to-negative for anyone listening rather than
reading. VoiceOver reads "January 5, 2024" naturally and "2024-01-05" as a run
of digits and dashes, and when the tooltip option is on some screen readers
announce both the content and the `title`, so the date is heard twice in two
formats.

Built: `aria-label` on the span, and on the `<time>` element itself since it
is rewritten in place rather than wrapped. Two of the three open questions
were settled by argument. The label carries the ORIGINAL, not the ISO value,
because the rewrite is a scanning aid and reading digits aloud is a
regression. It is set regardless of `showOriginal`, because that setting is a
visible tooltip and this is a different channel.

The third was settled by listening, which was the only way it could be.
VoiceOver announces the original once -- so `aria-label` does supersede both
the element's text and its `title` as the accessible name, and the
double-announcement worry does not survive contact with a real screen reader.
Not verified on NVDA; Windows is not a target, but the assumption is recorded
rather than generalised.

One gap worth knowing: when both appearance options are off, the text is
swapped in place with no element created -- deliberately, so framework DOM is
untouched -- and there is nothing to carry a label. That mode stays ISO-only
for assistive technology.

Deliberately not in 1.0.1: raised while filling in the App Store
accessibility declarations, with the release already mid-review across three
stores.

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

**Bump the build number before every archive.**

```
python3 tools/fix-safari-project.py --bump-build
```

`CURRENT_PROJECT_VERSION` is the build number and the converter leaves it at
1 forever. Two consequences, both nasty.

App Store Connect refuses a second upload with the same version AND build
number, so a rejected 1.0.1 cannot be fixed and re-uploaded until this moves.

And archives are named by timestamp, not by content, so with a constant build
number two archives read identically in Organizer -- "1.0.1 (1)" -- while
containing different code. That happened: an archive predating a fix sat next
to one containing it, both labelled 1.0.1, and uploading the wrong one would
have shipped a known bug. Delete archives once uploaded, and bump the number
so the remaining ones are never ambiguous.

`--bump-build` is deliberately not part of the default run: the other fixes
restore a known state and are idempotent, this one changes state every time.

**Name archives yourself.** Xcode's default is a timestamp, which is how two
1.0.1 archives ended up indistinguishable in the first place. Pass
`-archivePath` and use Apple's own `version (build)` form, so the filename
says the same thing Organizer's version column does:

```
xcodebuild -project "Year First.xcodeproj" -scheme "Year First" \
  -configuration Release archive \
  -archivePath ~/Library/Developer/Xcode/Archives/<date>/"Year First 1.0.2 (2).xcarchive"
```

The existing archives were renamed to match. Renaming the bundle is safe:
Organizer reads `Info.plist` inside it, and the app, its signature and the
extension's manifest all survive -- checked, not assumed. It only affects
what you see in Finder and the terminal, which is where the confusion was.

Two traps if you go looking at them by hand. `ApplicationPath` in the
archive's `Info.plist` is relative to `Products/`, not to the archive root,
so joining it directly reports the app as missing. And Xcode's timestamp
names contain U+202F before "PM" -- `find` prints something that looks like
a normal space, and the literal path then fails with `FileNotFoundError`.
Glob, do not retype.

**Safari's Extensions pane reads PlugInKit, not LaunchServices.** This is
the whole trap. `lsregister -dump` also lists every built copy of the app,
which looks like the answer, and `lsregister -u` removes them -- and Safari's
list does not change, because Safari never consulted it. PlugInKit keeps its
own records, one per .appex path, and shows one row per record.

```
pluginkit -m -A -D -i dev.immanuelqrw.year-first.Extension -vvv   # ground truth
pluginkit -r "<path to .appex>"                                   # remove one
```

Safari's own container is TCC-protected, so nothing in a terminal can read
the pane directly. PlugInKit is the closest thing to it; the final word is
the screen.

**Every signed build registers, and Xcode cannot be told not to.** There is
no build setting or defaults key for it -- I went looking through Xcode's
frameworks and there is nothing. A Debug build adds a row within seconds of
finishing, and restarting Safari does not clear it because the row is real.
Confirmed by observation: install, one row; rebuild, two rows; restart
Safari, still two.

Unsigned builds (`CODE_SIGNING_ALLOWED=NO`) register nothing. Worth knowing
before reproducing this -- the product lands on disk, no row appears, and it
looks like the bug fixing itself.

**Do not run the extension out of DerivedData.** That was the underlying
mistake here. Xcode owns that directory: it recreates products after they are
deleted (twice within minutes, while cleanup scripts raced it) and silently
swaps the copy Safari points at. The copy in daily use belongs in
/Applications, where Xcode cannot touch it:

```
ditto "<DerivedData>/Build/Products/Release/Year First.app" \
      "/Applications/Year First.app"
open "/Applications/Year First.app"     # launching is what registers it
```

The .appex cannot be registered on its own; `lsregister -f` on it reports
-10811, not an application. Launching the container is the way.

With that install in place, the cleanup keeps it and drops everything else:

```
python3 tools/clean-safari-registrations.py --check   # what Safari sees
python3 tools/clean-safari-registrations.py           # keep the install
python3 tools/clean-safari-registrations.py --keep Debug   # while developing
```

It removes each record before deleting its product -- the other order leaves
a record pointing at nothing, which Safari still renders -- and refuses
outright if what it was told to keep is not registered, so a typo leaves
duplicates rather than an empty pane. This is not a one-shot fix: run it
after building.

**Xcode cleans up after itself now.** `fix-safari-project.py` installs a
shared scheme whose *build post-action* runs the cleanup, so a build that
adds a row removes it again before you notice.

A post-action rather than a Run Script build phase: a build phase runs inside
the build, and the .appex is registered a moment *after* the build finishes,
so a phase would tidy up before there was anything to tidy. The post-action
polls (`--wait 20`) instead of assuming the row is already there, and always
exits 0 -- Xcode reports a failing post-action as a build failure, and a
duplicate row is not worth failing a build over. It removes records only,
never products: the product belongs to the build that just made it, and
deleting it would pull the app out from under a Run action.

Verified on a real build -- `Run post-actions` / `year-first: removed
build:Debug row` / `** BUILD SUCCEEDED **`, one row left afterwards.

The scheme has to be written out in full rather than patched, because Xcode
autocreates this project's scheme and there is no file on disk until someone
edits it. That also makes it exactly the kind of state regenerating the
project throws away, which is why it lives in this script.

**Run `tools/fix-safari-project.py` before every archive.** Not only after
regenerating the project -- before every single archive. The settings it
manages live only in the generated project, which is not in version control,
so there is nothing to diff against and nothing to review: drift is invisible
until it ships.

And it does drift, without anyone regenerating anything. Bumping to 1.0.2
found `MACOSX_DEPLOYMENT_TARGET` back at 11.0, having been set to 13.3 and
verified in a built binary earlier the same day, and the build post-action
gone from the scheme. Xcode rewrites both of those on its own -- opening a
scheme is enough for one, "update to recommended settings" for the other.
Archiving at 11.0 would have shipped an app that installs on systems with no
MV3 service worker, which is the failure the deployment target exists to
prevent, and no build warning marks it.

```
python3 tools/fix-safari-project.py --check   # report, change nothing
python3 tools/fix-safari-project.py           # apply
```

The Python tools have their own tests, since `node --test` does not reach
them:

```
python3 test/tools.test.py
```

Small, but this one decides which registrations to delete, and a wrong
answer there removes the copy Safari is actually using.

`--check` exits non-zero when anything needs fixing, so it is the one to run
if this ever goes in CI. The five fixes below are all idempotent; `--bump-build`
is deliberately excluded from both the default run and `--check`, because it
changes state rather than restoring it.

It reads the version from `manifest.base.json`, so bumping the version and
re-running is all a release needs. It refuses to guess: an unexpected project
shape is an error, not a best effort.

**The deployment target must be lowered.** The converter sets the
project-level `MACOSX_DEPLOYMENT_TARGET` to whatever SDK was current when it
ran -- 26.5 in our case -- and the app target inherits it, so the app refuses
to install on anything older. 13.3 is the real floor: the manifest uses
`background.service_worker`, which is MV3, Safari 16.4 is the first release
to support it, and Safari 16.4 ships with macOS 13.3. That is also the
version the no-lookbehind convention targets. The extension target sets its
own 10.14 and is left alone.

**The app needs a category.** `LSApplicationCategoryType` is unset after
conversion, which the archive build warns about and which the Mac App Store
requires. Set to `public.app-category.utilities`.

**The network entitlement must stay, and looks removable.** The converter
sets `ENABLE_OUTGOING_NETWORK_CONNECTIONS = YES` on the app target, granting
`com.apple.security.network.client`. It is tempting to remove: the extension
makes no network requests, and the listing, the privacy policy and both store
declarations all say so.

Removing it breaks the app. The wrapper hosts a `WKWebView`, and a sandboxed
app embedding one needs this entitlement for WebKit's own content process --
even when the page is a local `file://` from the bundle. Without it the app
launches, the window opens, and the web view renders **nothing**. No crash, no
error in the build, no sandbox denial in the log. Just a blank window.

The entitlement describes what WebKit needs, not what this code does. It says
nothing about the extension, which still makes no network requests of any
kind. `tools/fix-safari-project.py` puts it back if it is ever removed again.

This was removed once, on the reasoning above, and shipped a blank window that
built and launched cleanly. Verified only when someone looked at the running
app -- which is the lesson: "it builds" and "it launches" are not "it works".

**The Xcode project carries its own version and does not follow the
manifest.** The project references `dist/safari/`, so the extension content
updates when you rebuild -- but `MARKETING_VERSION` in `project.pbxproj` is
set once at generation and stays there, in four places. Otherwise the app
wrapper and the extension inside it report different versions, and the App
Store record follows the wrapper.

`tools/fix-safari-project.py` now does this: it reads the version out of
`manifest.base.json` and writes every occurrence, so bumping the manifest and
re-running the script is the whole procedure. Check the built app rather than
trusting the edit:

    defaults read "<built>.app/Contents/Info.plist" CFBundleShortVersionString

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
- Run `python3 tools/fix-safari-project.py` before every Safari archive, not
  just after regenerating the project. See the standing rule above: settings
  drift back on their own and nothing warns you.
- Costs: Firefox signing free (self-distribution allowed), Chrome $5 once,
  Safari $99/year plus shipping inside a native app.

**What each store actually got for 1.0.1.** The three submissions were
packaged at different times while work continued, so they are not the same
build. Established by diffing the uploaded artifacts against the tags, not
from memory:

| Store | Built from | Notes |
| --- | --- | --- |
| Chrome | the `v1.0.1` tag exactly | `~/Downloads/year-first-chrome.zip` |
| Firefox / AMO | the `v1.0.1` tag exactly | `~/Downloads/year-first-firefox.zip` |
| Mac App Store | tag + #26 | from the Xcode archive, `1.0.1 (1)` |

The Safari build is ahead by #26, the per-site off switch fix -- which is
Safari-only, an added fallback for `tab.url` not being exposed there. Chrome
and Firefox take the `tab.url` path unchanged, so they are missing nothing
that affects them. No store got a broken build.

Compare with the SPDX line normalised away, or everything looks different:
`build.py` retags the identifier per target, so the Safari copy differs from
`src/` on that line in every file.

None of the three has #31 (`aria-label` for screen readers), #35 (the
disabled-hosts list on the options page), or #36 (applying a toggle without
reloading). Those are the contents of 1.0.2, and it would put all three
stores back on the same source.

One thing not checkable from here: the accessibility declarations filled in
on App Store Connect. Nothing in `STORE-NOTES.md` claims screen-reader
support, but if anything VoiceOver-related was ticked there, the submitted
build predates #31.

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

python3 tools/fix-safari-project.py --check   # after any Safari regeneration
```

The test page checks itself: let it settle, then press **Check results**. It
reports pass or fail per row and says why when a row fails. Press
**Add three more dates** first to exercise the MutationObserver, then check
again.

Firefox and Safari do not run content scripts on `file://` URLs, which is
why the test page has to be served.
