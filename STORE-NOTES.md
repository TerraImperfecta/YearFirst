# Store submission notes

Copy for the review forms, kept here so the three submissions say the same
thing. Nothing in this file ships in the extension.

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
`xcrun safari-web-extension-converter`. See the licensing note in PLAN.md
before submitting — this is not purely a paperwork step.
