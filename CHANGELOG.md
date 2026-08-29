# Changelog

Notable changes to Year First. Format follows [Keep a Changelog][kac];
versions follow [Semantic Versioning][semver].

[kac]: https://keepachangelog.com/en/1.1.0/
[semver]: https://semver.org/spec/v2.0.0.html

## [Unreleased]

Nothing yet.

## [1.0.0] — unreleased

First release. Not yet submitted to any store.

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
- Toolbar popup with an on/off switch and the two appearance toggles; an
  "off" badge on the toolbar icon when rewriting is disabled.
- Options page with a live preview of the ambiguous case.
- Appearance options: keep the original text as a tooltip (on), and a dotted
  underline on rewritten dates (on).
- `data-no-year-first` attribute to skip any element's subtree.

### Deliberately not done

- Text inside `<input>`, `<textarea>`, `contenteditable`, `<code>`, `<pre>`,
  `<kbd>` and `<samp>` is left alone.
- Two-digit years match only with slashes (`3/4/25`), so version strings like
  `1.2.3` survive. Years 00–68 map to 2000s, 69–99 to 1900s.
- Impossible dates such as `31/02/2024` are ignored.
- Month names are English only.
- Dates inside shadow DOM are not reached.
