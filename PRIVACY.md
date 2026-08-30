# Privacy policy for Year First

Last updated: 2026-08-30

## The short version

Year First collects nothing, sends nothing, and has no server to send
anything to.

## What the extension does with page content

Year First reads the text of pages you visit in order to find dates and
rewrite them as `YYYY-MM-DD`. That reading happens entirely in your browser,
in memory, while the page is open. The text is not stored, not logged, and
not transmitted anywhere.

The extension needs access to every site because a date can appear on any
page, and neither you nor it can know in advance which pages will contain
one. It reads text nodes only.

## What is stored

Your settings, and nothing else:

- whether rewriting is on
- how to read ambiguous numeric dates such as 05/01/2024
- whether to use `<time>` element attributes
- whether to convert a bare month and year
- whether to keep the original text as a tooltip
- whether to underline rewritten dates
- the list of sites you have switched off individually

These are held in your browser's extension storage. If you have browser sync
turned on, your browser may sync them between your own devices using your
own browser account. That is your browser's sync, operated by your browser
vendor under their privacy policy. The settings never reach any server
operated by this extension, because there is no such server.

## What is not collected

No personally identifiable information. No health, financial, or payment
information. No authentication information. No personal communications. No
location. No browsing or web history. No user activity, clicks, keystrokes,
or mouse movement. No website content. No analytics of any kind.

## Third parties

None. The extension makes no network requests, contains no analytics or
advertising libraries, and shares no data with anyone, because it has no
data to share.

## Verifying this

The extension is not minified and not bundled. The code that runs is the
code as written, and you can read all of it in the extension's own folder.
It contains no `fetch`, no `XMLHttpRequest`, no `WebSocket`, no
`sendBeacon`, no `eval`, and no remotely loaded code.

## Children

The extension is not directed at children and collects no data from anyone,
including children.

## Changes

If this policy ever changes, the updated version will be published at the
same address and the date at the top will change. Since the extension
collects nothing, any change would be to add a capability, and that would
require a new permission you would be asked to grant.

## Contact

code.immanuelqrw@gmail.com
