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

## Host permission justification

The `<all_urls>` field is asked separately from the per-permission ones.

    The extension rewrites dates found in the text of whatever page the user
    is reading, so it needs to run on any site the user visits. There is no
    useful subset of the web to request instead: a date can appear on any
    page, and the user cannot know in advance which pages will contain one.
    Requesting a list of specific hosts would mean the extension silently
    fails on every site not on the list.

    Nothing is read from a page except its text nodes, and nothing leaves
    the machine. The extension makes no network requests of any kind -- no
    fetch, no XMLHttpRequest, no analytics, no telemetry. It has no server.
    The only data it stores is the user's own settings, kept in browser
    storage.

    all_frames is set because dates appear inside iframes -- embedded
    comment threads, dashboards, documentation viewers. Restricting to the
    top frame would silently skip them.

## Remote code

Answer: **No.** Verified against the built package, not just asserted:

- no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource` or
  `importScripts`
- no `eval`, no `new Function`, no string-form `setTimeout`
- the only `script src` tags are `popup.js` and `options.js`, both files
  inside the package
- the only URLs anywhere in the package are the SVG namespace, the GNU URLs
  inside the LICENSE text, and one `example.com` in a code comment

`new Function` does appear in `test/dates.test.js`, which is how the tests
reach a closed IIFE. `test/` is not shipped -- zero test files in the zip --
but it is worth knowing in case a reviewer reads the repository.

## User data collected

Answer: **none of the categories.** Leave every box unchecked.

The extension reads page text in memory to find dates and rewrites them in
place. It never stores that text, never sends it anywhere, and has nowhere
to send it. "Website content" is the box someone might reach for, since the
extension does read page text -- but the question is what is *collected*,
and nothing is retained or transmitted.

The only thing stored is the user's own settings -- the six options and the
list of sites switched off individually -- held in `storage.sync`, which is
the browser's sync, not a server belonging to this extension.

All three certification checkboxes are true and should be ticked: no selling
or transferring data to third parties, no use unrelated to the single
purpose, no use for creditworthiness or lending.

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

# App Store Connect (Safari)

A separate listing from the other two, for an **app**, not an extension. Most
of the extension copy does not transfer: a Mac App Store visitor is buying an
app and needs telling that the thing they install is a Safari extension and
how to switch it on.

## Creating the record

    Platform            macOS
    Name                Year First            (10 of 30 characters)
    Primary language    English (U.S.)
    Bundle ID           dev.immanuelqrw.year-first
    SKU                 year-first-macos      (never shown to users)
    User access         Full Access

## Version information

    Version             1.0.2   <- the form prefills 1.0; it must match
                                the build or the listing and binary disagree
    Category            Utilities
    Copyright           2026 Immanuel Washington
    Minimum macOS       13.3   (set by the build, not typed here)

    Support URL         https://github.com/TerraImperfecta/YearFirst
    Marketing URL       (optional -- same, or leave blank)
    Privacy Policy URL  https://github.com/TerraImperfecta/YearFirst/blob/main/PRIVACY.md

Support URL is required and there is no way round it. The repository is
public, so it serves.

## Promotional text

App Store only, 170 characters, and the one field that can be changed later
without submitting a new build. It appears above the description.

    Every date on the page, in one format. Even 05/01, read the way your
    page means it.

## Keywords

100 characters, comma separated, no spaces after commas:

    date,dates,ISO,8601,YYYY-MM-DD,format,reformat,timestamp,unambiguous,calendar

## Description

    Year First rewrites every date on the pages you visit to YYYY-MM-DD.

    This app installs the Year First extension for Safari. Once installed,
    open Safari, choose Settings, then Extensions, and turn on Year First.
    Safari will ask which sites it may run on.

    Dates are rewritten largest unit first, in the order that actually
    sorts. It reads the formats people write: January 5, 2024 and 5 Jan
    2024 both become 2024-01-05; 23/07/2024 becomes 2024-07-23; 3/4/25
    becomes 2025-04-03.

    05/01/2024 is the hard one, because it means two different days
    depending on who wrote it. Year First looks for other dates on the same
    page that can only be read one way -- anything with a part above 12 --
    and lets those decide. Failing that it uses the page's own language. Or
    you can simply tell it: day first, month first, or work it out.

    Timestamps marked up as time elements are read from their machine-
    readable attribute, so "three hours ago" becomes a real date.

    Some sites are better left as they are -- code review tools, log
    viewers. The toolbar popup has an off switch for the site you are on,
    separate from the global one.

    It is careful about what it does not touch. Code, preformatted text,
    input fields and anything you are editing are left alone. Version
    numbers like 1.2.3 survive, as do fractions, year ranges, and
    impossible dates like 31/02/2024. A date already written as 2024-01-05
    is left exactly as it is.

    No accounts, no network requests, no analytics, no data collection of
    any kind. Your settings are stored by your browser and never leave it.
    The source is public and readable -- nothing minified, nothing bundled
    -- so you can check every word of this yourself.

## App Privacy

Answer **Data Not Collected**. Nothing is collected, so no data types are
declared and no purposes need selecting. Age rating 4+.

## Screenshots

Mac sizes: 1280x800, 1440x900, 2560x1600, 2880x1800. At least one, up to ten.
The existing set is already 1280x800 and 2560x1600, so sizing is done -- but
what is *in* them matters:

    reusable   1-before, 1-after, 4-ambiguous, 5-unchanged
               cropped to page content, no browser chrome, so they are not
               visibly Chrome

    retake     2-popup, 3-options
               these show Chrome's window and toolbar. A Chrome screenshot
               in a Safari listing is wrong and invites a rejection. Retake
               both in Safari.

    new        the app's own window
               a Mac App Store visitor installs an APP. Lead with the thing
               they actually launch, showing the enable-in-Safari
               instructions, then follow with Safari doing the work.

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
    bundled -- so you can check every word of this yourself.

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

## App Review Information — Notes

1.0.1 was rejected under **2.1.0 Performance: App Completeness**. Nothing was
found wrong with the binary: the reviewer asked for information, because a
Safari extension's container app is one line of text and a button, and
nothing in the submission said what the extension itself does.

**The Notes field is capped at 4000 characters.** The text below is 3993,
so it fits with nothing to spare -- measure before editing, do not estimate.
It answers Apple's seven questions in their order and is written to be reused
on every future submission, which is what Apple asked for. Paste it into both
places: App Review Information -> Notes on the version page, and the reply to
Apple on the submission, with the recording attached.

### Submitted verbatim, 2026-09-18

```
Year First is a Safari web extension. The app is the container Safari
extensions must ship inside: one line of text and a button that opens
Safari's Extensions settings. All functionality lives in the extension, so
launching the app alone does not demonstrate the product.

1. SCREEN RECORDING
Attached to the App Review reply. Captured on the Mac in item 2, starting
with launching the app. It covers: opening Safari's Extensions settings from
the app's button, enabling the extension, granting website access at
Safari's prompt, a Wikipedia article with its dates rewritten to YYYY-MM-DD
in place, the toolbar popup with the master and per-site switches, switching
the site off (page reloads, original dates) and back on, and the settings
page including the list of sites switched off.

None of the flows in your message apply: no account registration, login or
deletion; no paid content, purchase or subscription; no user-generated
content, so no reporting or blocking; no request for location, contacts,
camera or App Tracking Transparency. The only prompt is Safari's own request
for website access, shown in the recording.

2. DEVICES AND OPERATING SYSTEMS TESTED
MacBook Pro (Mac17,9), Apple M5 Pro. macOS 26.6.2 (25G83), Safari 26.6.2.

The deployment target is macOS 13.3. That is the supported floor, not a
tested configuration: the extension is Manifest V3 and uses a background
service worker, first supported in Safari 16.4, which shipped in macOS 13.3.

3. WHAT IT DOES, AND FOR WHOM
Year First rewrites dates on the pages you visit into ISO 8601, YYYY-MM-DD.

All-numeric dates are ambiguous: 05/01/2024 is 5 January to most of the
world and May 1 in the United States, and nothing on the page says which.
Even unambiguous dates are written a dozen ways, so comparing them across
sites means reading each carefully. One sortable format everywhere fixes it.

It is for people reading across international sites: developers in issue
trackers and changelogs, researchers working with foreign sources, and
anyone who has misread a date by a month.

4. SETTING UP AND USING IT
No account, no login, no in-app purchase, no sample files, no credentials.

Launch the app and click its single button, which opens Safari's Extensions
preferences. Enable Year First there and allow it on websites. Everything
after that happens in Safari. Dates are rewritten automatically on every
page. The toolbar popup holds the master switch, a switch for the current
site, and the underline and tooltip options. The settings page holds how to
read ambiguous dates, what to rewrite, appearance, and the sites switched
off.

5. EXTERNAL SERVICES, TOOLS AND PLATFORMS
None. Neither the extension nor the app makes any network request. There is
no analytics, no telemetry, no third-party SDK, no AI service, no payment
processor and no authentication provider. No code is loaded at runtime.

One apparent exception that is not one: the app declares
com.apple.security.network.client. WKWebView requires that entitlement
inside the App Sandbox even to render a local page bundled in the app, and
the app's window is exactly that. It is not used to reach the network.

6. REGIONAL DIFFERENCES
Features are identical in every region and the output is always YYYY-MM-DD.

One behaviour varies, and it is the point of the extension rather than a
regional restriction: how an ambiguous all-numeric date is read. The default
follows other dates on the page that can only be read one way, then the
page's language; the user can force day-first or month-first. Month names
are recognised in English only. No content is region-locked and there is no
geographic restriction of any kind.

7. REGULATED INDUSTRY, PROTECTED MATERIAL
Neither applies. The extension does not operate in a regulated industry and
carries no third-party or protected material. All code is original and
written by the developer, who holds the copyright. No third-party libraries
are bundled; the shipped extension is thirteen original files.
```

### Not for Apple

Everything below is working material. Keep it out of the paste: the first
draft mixed guidance to ourselves in with the answers, and trimming it by
hand silently dropped the entitlement paragraph, which is the one thing in
the reply a reviewer is most likely to challenge.

**Shot list for the recording.** Apple asks that it begin with launching the
app. For an extension that means the least interesting window is on screen
first -- go through it anyway, do not start in Safari.

    1.  Launch Year First from Applications.
    2.  Click "Quit and Open Safari Extensions Preferences…".
    3.  Tick Year First. Allow it on every website when asked.
    4.  Open a dates-heavy page and show them rewritten in place.
    5.  Hover a rewritten date to show the original in a tooltip.
    6.  Open the toolbar popup: master switch, per-site switch.
    7.  Switch the site off. The page reloads with original dates.
    8.  Switch it back on. Dates return without a reload.
    9.  Open Settings: date order, appearance, sites switched off.
    10. Turn the site back on from that list.

**Which page to record on.** Measured by running `src/content.js` over the
fetched HTML and counting rewrites in the densest 1500 characters of text:

    en.wikipedia.org/wiki/MacOS_version_history    285 rewritten, 39 densest
    en.wikipedia.org/wiki/Safari_(web_browser)     708 rewritten, 34 densest
    en.wikipedia.org/wiki/Apollo_11                459 rewritten, 31 densest
    nodejs.org/en/about/previous-releases           16 rewritten, 13 densest

Density is what matters on video, not the total: the Safari article rewrites
most but spreads them over a long page, so any one frame shows fewer. Use
the macOS version history table. `test/test.html` is a supplement, not a
substitute -- served over http, it shows every format at once and exercises
the MutationObserver, but a `localhost:8000` URL is not evidence the
extension works on the real web.

**Recording and compressing.** Shift-Cmd-5, Options -> Show Mouse Clicks,
Record Entire Screen. Compress with `avconvert`, which is built in:

    avconvert --source in.mov --output out.mov --preset Preset1920x1080

Screen recordings of scrolling text compress badly with these presets --
2:33 of 3024x1964 went 114 MB -> 80 MB at 1080p, 57 MB at 720p. `ffmpeg`
with a quality target would do far better if the attachment is ever refused.

**What was cut to reach 4000 characters**, none of which answers a question
Apple asked: the tooltip-hover beat, the "dates return, no reload"
parenthetical, the file breakdown (four scripts, two pages, a manifest, five
icons, the licence), and the MPL-2.0/GPL-3.0 dual-licensing note.

**The unused entitlement.** The app also carries
`com.apple.security.files.user-selected.read-only`, a converter default it
never exercises. Removing an entitlement is what shipped a blank window
once. Leave it until 1.0.2 is through, then verify by looking at the running
window rather than at a successful build.

## Before submitting

- [ ] Screenshots taken and cropped to size
- [ ] Listing copy edited into your own voice
- [ ] `python3 build.py --zip` run, or a `v*` tag pushed to let CI build them
- [ ] Chrome: permissions justification pasted from the section above
- [ ] AMO: check current policy on the manifest data collection key
- [ ] Safari: confirm the build carries the MPL licence, not the GPL one
