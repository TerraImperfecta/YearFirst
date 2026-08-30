# Store submission notes

Everything needed to submit: the public listing copy, and the answers to the
review questions. Kept here so the three submissions say the same thing.
Nothing in this file ships in the extension.

## Permissions, and why each is needed

Reviewers ask about `<all_urls>` on every store. The honest answer is short.

**`<all_urls>` host access.** The extension's entire function is rewriting
dates in the text of whatever page the user is reading. There is no useful
subset of the web to request instead — a date can appear on any site, and the
user cannot know in advance which pages will contain one. Nothing is read from
a page except its text nodes, and nothing leaves the machine.

**`all_frames: true`.** Dates appear inside iframes — embedded comment
threads, dashboards, documentation viewers. Restricting to the top frame
would silently skip them.

**`storage`.** Holds the six user settings (enabled, numeric order, the
`<time>` toggle, month-year, and the two appearance options). `storage.sync`
so preferences follow the user between their own browsers.

**`activeTab`.** The popup reads the current tab to offer a reload after a
setting changes, since dates already rewritten stay rewritten until the page
loads again.

Note there is no `tabs` permission, no `webRequest`, no `scripting`, no
`cookies`, and no optional permissions.

## Data collection declaration

**Nothing is collected.** This is verifiable from the source rather than a
promise:

- No `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon` anywhere in
  `src/`. The extension makes no network requests of any kind.
- No `eval`, no `new Function`, no remotely hosted code, no analytics SDK, no
  telemetry.
- The only URL in the source is the SVG namespace in `icons/icon.svg`.
- No advertising, no tracking, no fingerprinting, no user identifiers.

One nuance worth stating accurately rather than glossing: the six settings are
kept in `storage.sync`, so the *browser* syncs them through the user's own
Firefox or Google account. That is the browser vendor's sync, not collection
by this extension — the settings never reach any server operated by the
developer, because there is no such server.

## Source and build

Not obfuscated, not minified, no bundler. `src/` is plain JavaScript that
ships as-is. `build.py` copies `src/` and patches `manifest.base.json` per
browser; `dist/<target>/` is the result and is committed to the repository so
it can be checked against the source.

Reproduce with:

    python3 build.py --zip

## Per store

**Firefox / AMO.** Add-on ID `year-first@immanuelqrw.dev`,
`strict_min_version` 115.0. Under Manifest V3 Firefox grants host access per
site, so first-run instructions in the listing should mention
Always Allow on This Site. Check current AMO policy on the manifest data
collection disclosure key before submitting — the requirement has changed.

**Chrome Web Store.** Single purpose: rewriting dates on web pages to a
single unambiguous format. The `<all_urls>` justification above goes in the
permissions-justification field.

**Safari / App Store.** Ships inside a native app via
`xcrun safari-web-extension-converter`. This build is licensed **MPL-2.0**,
not GPL-3.0 like the others — GPLv3 cannot lawfully be distributed through
the App Store, since Apple's terms impose usage restrictions that GPLv3
section 10 forbids adding. `build.py` handles this; `dist/safari/LICENSE` is
the MPL text and the shipped sources are tagged to match. Do not "fix" the
inconsistency with the other targets.

---

# Listing copy

Draft. Written to be pasted, then edited — the voice should be yours.

## Name

    Year First

## Short description

Chrome allows 132 characters, AMO's summary allows 250. This fits both, and
matches the promo tile:

    Every date on the page, in one format: YYYY-MM-DD.

## Detailed description

Two constraints on this text, both learned the annoying way. No angle
brackets: store description fields strip or escape them, so `<time>` renders
as nothing or as `&lt;time&gt;`. No aligned columns: the field renders in a
variable-width font with no monospace option, so an ASCII table comes out
ragged. Both are why the examples are prose.

    Every date on the page, in one format: 2024-01-05.

    Year First rewrites dates as it finds them, largest unit first, in the
    order that actually sorts. It reads the formats people write: January
    5, 2024 and 5 Jan 2024 both become 2024-01-05; 23/07/2024 becomes
    2024-07-23; 3/4/25 becomes 2025-04-03.

    05/01/2024 is the hard one, because it means two different days
    depending on who wrote it. Year First looks for other dates on the same
    page that can only be read one way -- anything with a part above 12 --
    and lets those decide. Failing that it uses the page's own language. Or
    you can simply tell it: day first, month first, or work it out.

    Timestamps marked up as time elements are read from their machine-
    readable attribute, so "three hours ago" becomes a real date.

    Some sites are better left as they are -- code review tools, log
    viewers, anything where the original string is the point. The toolbar
    popup has an off switch for the site you are on, separate from the
    global one.

    It is careful about what it does not touch. Code, preformatted text,
    input fields and anything you are editing are left alone. Version
    numbers like 1.2.3 survive, as do fractions, year ranges, and
    impossible dates like 31/02/2024. A date already written as 2024-01-05
    is left exactly as it is. Add data-no-year-first to skip any element
    and everything inside it.

    Dates that appear after the page loads get rewritten too.

    No accounts, no network requests, no analytics, no data collection of
    any kind. Your settings are stored by your browser and never leave it.
    The source is public and readable -- nothing minified, nothing
    bundled.

## Category

- Chrome Web Store: Functionality & UI (under the "Make Chrome Yours"
  group, not Productivity). Chosen from what the categories actually
  contain rather than from their names: Functionality & UI holds Just Read,
  DocsAfterDark and SponsorBlock -- extensions that change how pages look
  as you browse. Tools holds PDF converters, translators and dictionaries
  -- capabilities you invoke. Year First is the former.
- AMO: Appearance, or Other

## Screenshots

Chrome takes 1280x800 or 640x400, up to five. AMO is flexible. The same five
work for both, and the order matters -- the first is the only one many people
see.

1. **Before and after on a real page.** The whole pitch in one image. Pick a
   page with several date formats visible at once -- a news index or a
   changelog. Split or stack the two states.
2. **The toolbar popup**, open, showing the on/off switch and the toggles.
   Proves it is controllable at a glance.
3. **The options page**, showing the "Reading 05/01/2024" control with its
   live preview. This is the feature that distinguishes it from the several
   other date extensions; give it a whole shot.
4. **The ambiguous case resolved** -- a page where automatic detection got
   05/01 right, ideally with the unambiguous date that voted for it visible
   in the same frame.
5. **The "should not change" section of test/test.html**, showing version
   numbers and fractions untouched. Restraint is a feature, and it answers
   the reviewer's unasked question about false positives.

Small promo tile for Chrome is 440x280: the icon on the tile amber (#B8730E)
with the wordmark, or a single before/after pair large enough to read.

## Before submitting

- [ ] Screenshots taken and cropped to size
- [ ] Listing copy edited into your own voice
- [ ] `python3 build.py --zip` run, or a `v*` tag pushed to let CI build them
- [ ] Chrome: permissions justification pasted from the section above
- [ ] AMO: check current policy on the manifest data collection key
- [ ] Safari: confirm the build carries the MPL licence, not the GPL one
