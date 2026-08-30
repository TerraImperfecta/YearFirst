# Changelog

Notable changes to Year First. Format follows [Keep a Changelog][kac];
versions follow [Semantic Versioning][semver].

[kac]: https://keepachangelog.com/en/1.1.0/
[semver]: https://semver.org/spec/v2.0.0.html

## [1.0.2] — 2026-08-30

### Added

- The settings page lists the sites Year First is switched off on, and turns
  them back on. Switching a site off has always been a one-way door from the
  popup: to switch it back on you had to be on that site. Fine for the site
  in front of you, useless for one switched off months ago.

### Changed

- A rewritten date is now announced to screen readers as the text it
  replaced. `YYYY-MM-DD` is a scanning aid; read aloud it is a run of digits
  and dashes, which is worse than the prose it replaced. Sighted readers see
  the rewrite, listeners hear the page as it was.

### Fixed

- Toggling the extension, or a single site, no longer reloads the page when
  switching it back **on**. The content script is already there and rewrites
  in place, so the page no longer flashes and then visibly changes under
  itself. Switching **off** still reloads, because a rewritten date has lost
  the text it replaced and there is nothing to put back without a fresh load.

- The per-site off switch was missing from the popup on Safari. Safari does
  not give the popup the tab's URL through `activeTab`, so the popup could
  not tell which site it was looking at and hid the row. It now asks the
  content script, which is already running on the page. No new permission.

  Shipped to the Mac App Store in 1.0.1 already -- that build was packaged
  after the fix landed, where the Chrome and Firefox uploads were packaged
  before it. 1.0.2 puts all three back on the same source.

## [1.0.1] — 2026-08-30

### Added

- The Firefox build now declares that it collects no data, using the
  `data_collection_permissions` key AMO requires of all new extensions from
  2025-11-03. Firefox 140 and later show "doesn't collect any data" in the
  install prompt and under Permissions and data in about:addons; older
  versions ignore the key.

`strict_min_version` stays at 115. The rule that would force 140 exists so
that extensions which *do* collect data can show a custom consent screen on
older Firefox, and this one collects nothing.

No change to the Chrome or Safari builds beyond the version number.

## [1.0.0] — 2026-08-30

First release. Tagged and built for all three browsers; not yet submitted to
any store.

### Added

- Rewrites dates found in page text to `YYYY-MM-DD`, across Firefox, Chrome
  and Safari from one source tree.
- Recognises month-name forms (`January 5, 2024`, `5 Jan 2024`,
  `the 22nd of September, 1998`), numeric forms with `-`, `/` or `.`
  separators, and ISO-like forms that only need padding (`2024-1-5`).
- Resolves ambiguous numeric dates (`05/01/2024`) day-first, month-first, or
  automatically — the automatic mode lets unambiguous dates on the same page
  vote, then falls back to the page's `lang`.
- Reads `<time datetime="...">` attributes, so relative timestamps such as
  "three hours ago" become real dates.
- Optional `March 2024` → `2024-03` conversion, off by default.
- Rewrites content added after load, via a MutationObserver.
- Finds dates broken across inline markup, so a date written with the space
  inside its own element -- as Wikipedia does -- is still rewritten. Only
  whitespace gaps are joined; a date split across two links is left alone
  rather than have the links deleted.
- Toolbar popup with an on/off switch and the two appearance toggles; an
  "off" badge on the toolbar icon when rewriting is disabled.
- Options page with a live preview of the ambiguous case.
- Appearance options: keep the original text as a tooltip (on), and a dotted
  underline on rewritten dates (on).
- `data-no-year-first` attribute to skip any element's subtree.
- Per-site off switch in the toolbar popup, for sites where the original date
  string matters. Remembered per host, so one entry covers a site over both
  http and https while different ports stay separate. Independent of the
  global on/off switch.
- Dual licensing by distribution channel: GPL-3.0-or-later for the Firefox
  and Chrome builds, MPL-2.0 for the Safari build, which cannot ship GPLv3
  through the App Store.

### Deliberately not done

- Text inside `<input>`, `<textarea>`, `contenteditable`, `<code>`, `<pre>`,
  `<kbd>` and `<samp>` is left alone.
- Two-digit years match only with slashes (`3/4/25`), so version strings like
  `1.2.3` survive. Years 00–68 map to 2000s, 69–99 to 1900s.
- Impossible dates such as `31/02/2024` are ignored.
- Dates already written as `YYYY-MM-DD` are left entirely alone: no span, no
  underline, and no tooltip repeating what is already on screen.
- Month names are English only.
- Dates inside shadow DOM are not reached.
