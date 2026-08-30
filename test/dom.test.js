/* DOM-side tests: the TreeWalker, the rewriting, the <time> handling and the
 * MutationObserver. These drive the real content script inside jsdom and
 * assert on the resulting document -- black box, through observable effects,
 * because content.js is a closed IIFE that exports nothing.
 *
 * jsdom does NOT implement isContentEditable, so the contenteditable skip is
 * NOT covered here -- asserting it would test jsdom, not the extension. It is
 * covered in test/test.html, which runs in real browsers.
 *
 * jsdom also has no requestIdleCallback, so the script takes its
 * setTimeout(fn, 100) fallback -- the same path older Safari uses. Waits below
 * poll rather than sleeping a fixed amount.
 *
 *     node --test test/*.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "..", "src", "content.js"), "utf8");

/* Boot the real content script over `html` with `settings` layered onto
 * whatever defaults the script itself asks storage for. */
function boot(html, settings = {}, { lang = "en-US", url = "https://example.com/page" } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html lang="${lang}"><body>${html}</body></html>`,
    { runScripts: "dangerously", url }
  );
  const { window } = dom;
  window.chrome = {
    storage: {
      sync: { get: (defaults) => Promise.resolve({ ...defaults, ...settings }) },
      onChanged: { addListener() {} },
    },
  };
  const script = window.document.createElement("script");
  script.textContent = SOURCE;
  window.document.body.appendChild(script);
  return dom;
}

/* Poll until `fn()` is truthy. The script defers work behind a 100ms timeout,
 * and a fixed sleep would be either flaky or slow. */
async function waitFor(window, fn, { timeout = 3000, label = "condition" } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => window.setTimeout(r, 10));
  }
}

const textOf = (dom, sel = "body") => dom.window.document.querySelector(sel).textContent;

/* ------------------------------------------------------------------ *
 * Rewriting text nodes
 * ------------------------------------------------------------------ */

test("rewrites a date in a text node", async () => {
  const dom = boot("<p>Filed on January 5, 2024 in the district court.</p>");
  await waitFor(dom.window, () => textOf(dom).includes("2024-01-05"), { label: "rewrite" });
  assert.match(textOf(dom, "p"), /Filed on 2024-01-05 in the district court\./);
});

test("with both appearance options off, swaps text without adding elements", async () => {
  const dom = boot("<p>Filed on January 5, 2024 today.</p>",
    { showOriginal: false, highlight: false });
  await waitFor(dom.window, () => textOf(dom).includes("2024-01-05"), { label: "rewrite" });
  const p = dom.window.document.querySelector("p");
  assert.equal(p.children.length, 0, "DOM shape must be unchanged on framework-rendered pages");
  assert.equal(p.childNodes.length, 1, "should still be a single text node");
});

test("showOriginal wraps the date and keeps the original as a title", async () => {
  const dom = boot("<p>Filed on January 5, 2024 today.</p>",
    { showOriginal: true, highlight: false });
  const span = await waitFor(dom.window,
    () => dom.window.document.querySelector("span.year-first-date"), { label: "span" });
  assert.equal(span.textContent, "2024-01-05");
  assert.equal(span.title, "January 5, 2024", "title should carry the text it replaced");
});

test("highlight applies a dotted underline in currentColor", async () => {
  const dom = boot("<p>Filed on January 5, 2024 today.</p>",
    { showOriginal: false, highlight: true });
  const span = await waitFor(dom.window,
    () => dom.window.document.querySelector("span.year-first-date"), { label: "span" });
  assert.match(span.style.textDecoration, /underline/);
  assert.equal(span.style.getPropertyValue("text-decoration-color").toLowerCase(), "currentcolor",
    "must not use the brand accent -- an amber squiggle reads as a spellcheck error");
});

test("a date already in the target format is left completely alone", async () => {
  // Wrapping it gains nothing: the span, the underline and a tooltip that
  // repeats the visible text are all noise.
  const dom = boot("<p>Log line 2024-03-09 14:02 UTC.</p>",
    { showOriginal: true, highlight: true });
  await new Promise((r) => dom.window.setTimeout(r, 300));
  assert.equal(dom.window.document.querySelector("span.year-first-date"), null,
    "no markup should be added when the text would not change");
  assert.equal(textOf(dom, "p"), "Log line 2024-03-09 14:02 UTC.");
});

test("a date that only needs padding is still rewritten", async () => {
  // Guards against over-correcting the above: 2024-1-5 differs from
  // 2024-01-05, so it is a real change and must still happen.
  const dom = boot("<p>Already tidy: 2024-1-5 needs padding.</p>",
    { showOriginal: true, highlight: false });
  const span = await waitFor(dom.window,
    () => dom.window.document.querySelector("span.year-first-date"), { label: "span" });
  assert.equal(span.textContent, "2024-01-05");
  assert.equal(span.title, "2024-1-5");
});

test("a rewritten time element keeps the original text as its tooltip", async () => {
  const dom = boot('<p>Posted <time datetime="2023-11-14">three years ago</time>.</p>',
    { showOriginal: true, highlight: true });
  await waitFor(dom.window, () => textOf(dom, "time") === "2023-11-14", { label: "time rewrite" });
  await new Promise((r) => dom.window.setTimeout(r, 200));

  const time = dom.window.document.querySelector("time");
  assert.equal(time.querySelector("span.year-first-date"), null,
    "the ISO text must not be re-wrapped inside the time element -- a nested " +
    "span covers the text and its title wins on hover, hiding the original");
  assert.equal(time.title, "three years ago",
    "hovering should show what the date replaced, not the date again");
});

/* ------------------------------------------------------------------ *
 * What must be left alone
 * ------------------------------------------------------------------ */

for (const tag of ["code", "pre", "kbd", "samp", "textarea"]) {
  test(`leaves <${tag}> alone`, async () => {
    const dom = boot(
      `<p>Filed on January 5, 2024 today.</p><${tag}>Released January 5, 2024 here.</${tag}>`);
    await waitFor(dom.window, () => textOf(dom, "p").includes("2024-01-05"),
      { label: "the paragraph to be rewritten first" });
    assert.match(textOf(dom, tag), /January 5, 2024/, `<${tag}> content must not change`);
  });
}

test("leaves a [data-no-year-first] subtree alone", async () => {
  const dom = boot(
    `<p>Filed on January 5, 2024 today.</p>
     <div data-no-year-first><span>Filed on January 5, 2024 today.</span></div>`);
  await waitFor(dom.window, () => textOf(dom, "p").includes("2024-01-05"),
    { label: "the paragraph to be rewritten first" });
  assert.match(textOf(dom, "div span"), /January 5, 2024/, "the whole subtree must be skipped");
});

test("leaves strings that are not dates alone", async () => {
  const dom = boot("<p>Version 2.5.1, ratio 3/4, range 2020-2024, and 31/02/2024.</p>");
  await new Promise((r) => dom.window.setTimeout(r, 300));
  assert.equal(textOf(dom, "p"), "Version 2.5.1, ratio 3/4, range 2020-2024, and 31/02/2024.");
});

/* ------------------------------------------------------------------ *
 * <time datetime="...">
 * ------------------------------------------------------------------ */

test("reads the datetime attribute rather than the visible text", async () => {
  const dom = boot('<p><time datetime="2023-11-14">three years ago</time></p>');
  await waitFor(dom.window, () => textOf(dom, "time") === "2023-11-14", { label: "time rewrite" });
  assert.equal(dom.window.document.querySelector("time").dataset.yearFirstDone, "1");
});

test("does not touch time elements when the option is off", async () => {
  const dom = boot('<p><time datetime="2023-11-14">three years ago</time></p>',
    { convertTimeElements: false });
  await new Promise((r) => dom.window.setTimeout(r, 300));
  assert.equal(textOf(dom, "time"), "three years ago");
});

/* ------------------------------------------------------------------ *
 * Reading ambiguous numeric dates
 * ------------------------------------------------------------------ */

test("day-first setting reads 05/01/2024 as 5 January", async () => {
  const dom = boot("<p>Moved to 05/01/2024 finally.</p>", { numericOrder: "dmy" });
  await waitFor(dom.window, () => textOf(dom, "p").includes("2024-"), { label: "rewrite" });
  assert.match(textOf(dom, "p"), /2024-01-05/);
});

test("month-first setting reads 05/01/2024 as 1 May", async () => {
  const dom = boot("<p>Moved to 05/01/2024 finally.</p>", { numericOrder: "mdy" });
  await waitFor(dom.window, () => textOf(dom, "p").includes("2024-"), { label: "rewrite" });
  assert.match(textOf(dom, "p"), /2024-05-01/);
});

test("auto mode lets an unambiguous date on the page decide", async () => {
  // 23/07/2024 can only be day-first, so 05/01/2024 should follow it.
  const dom = boot(
    "<p>Invoiced 23/07/2024 and again.</p><p id=x>Moved to 05/01/2024 finally.</p>",
    { numericOrder: "auto" });
  await waitFor(dom.window, () => textOf(dom, "#x").includes("2024-"), { label: "rewrite" });
  assert.match(textOf(dom, "#x"), /2024-01-05/, "should have voted day-first");
});

/* ------------------------------------------------------------------ *
 * Content added after load
 * ------------------------------------------------------------------ */

test("rewrites nodes added after load", async () => {
  const dom = boot("<p>Filed on January 5, 2024 today.</p><div id=host></div>");
  const { document } = dom.window;
  await waitFor(dom.window, () => textOf(dom, "p").includes("2024-01-05"), { label: "initial pass" });

  const added = document.createElement("p");
  added.id = "late";
  added.textContent = "Injected on 23/07/2024 afterwards.";
  document.getElementById("host").appendChild(added);

  await waitFor(dom.window, () => textOf(dom, "#late").includes("2024-07-23"),
    { label: "the MutationObserver to pick up the new node" });
});

test("picks up characterData changes", async () => {
  const dom = boot("<p id=t>nothing here yet at all</p>");
  await new Promise((r) => dom.window.setTimeout(r, 200));
  dom.window.document.getElementById("t").firstChild.nodeValue =
    "Filed on January 5, 2024 today.";
  await waitFor(dom.window, () => textOf(dom, "#t").includes("2024-01-05"),
    { label: "the MutationObserver to pick up the text change" });
});

test("does not rewrite an already-rewritten date a second time", async () => {
  const dom = boot("<p>Filed on January 5, 2024 today.</p><div id=host></div>",
    { showOriginal: true });
  const { document } = dom.window;
  await waitFor(dom.window, () => document.querySelector("span.year-first-date"), { label: "initial pass" });

  // Force another pass, then confirm the first date was not re-wrapped.
  const added = document.createElement("p");
  added.textContent = "Also 23/07/2024 here.";
  document.getElementById("host").appendChild(added);
  await waitFor(dom.window, () => document.querySelectorAll("span.year-first-date").length === 2,
    { label: "the second date" });

  assert.equal(document.querySelectorAll("span.year-first-date").length, 2,
    "exactly one span per date, not nested or duplicated");
  assert.equal(document.querySelector("span.year-first-date span"), null,
    "spans must not nest");
});

/* ------------------------------------------------------------------ *
 * Per-site off switch
 * ------------------------------------------------------------------ */

const DATE_LINE = "<p>Filed on January 5, 2024 today.</p>";

test("does nothing on a host the user has switched off", async () => {
  const dom = boot(DATE_LINE, { disabledHosts: ["example.com"] });
  await new Promise((r) => dom.window.setTimeout(r, 300));
  assert.equal(textOf(dom, "p"), "Filed on January 5, 2024 today.");
});

test("still runs on a host that is not on the list", async () => {
  const dom = boot(DATE_LINE, { disabledHosts: ["elsewhere.example"] });
  await waitFor(dom.window, () => textOf(dom, "p").includes("2024-01-05"),
    { label: "rewrite on an unlisted host" });
});

test("switching a site off covers both http and https", async () => {
  // Nobody thinks of http://example.com and https://example.com as two sites,
  // and the popup row says the host, so one entry has to cover both.
  for (const url of ["http://example.com/page", "https://example.com/page"]) {
    const dom = boot(DATE_LINE, { disabledHosts: ["example.com"] }, { url });
    await new Promise((r) => dom.window.setTimeout(r, 300));
    assert.equal(textOf(dom, "p"), "Filed on January 5, 2024 today.",
      `${url} should be covered by the single host entry`);
  }
});

test("ports stay separate: localhost:3000 is not localhost:8000", async () => {
  // The reason this matches host rather than bare hostname. A dev server and
  // a test page on the same machine really are different sites.
  const off = boot(DATE_LINE, { disabledHosts: ["localhost:3000"] },
    { url: "http://localhost:3000/page" });
  await new Promise((r) => off.window.setTimeout(r, 300));
  assert.equal(textOf(off, "p"), "Filed on January 5, 2024 today.", "the listed port is off");

  const on = boot(DATE_LINE, { disabledHosts: ["localhost:3000"] },
    { url: "http://localhost:8000/page" });
  await waitFor(on.window, () => textOf(on, "p").includes("2024-01-05"),
    { label: "a different port to be unaffected" });
});

test("a disabled host does not stop other sites, and does not touch the master switch", async () => {
  const dom = boot(DATE_LINE, { enabled: true, disabledHosts: ["example.com"] });
  await new Promise((r) => dom.window.setTimeout(r, 300));
  assert.equal(textOf(dom, "p"), "Filed on January 5, 2024 today.", "this host is off");

  const other = boot(DATE_LINE, { enabled: true, disabledHosts: ["example.com"] },
    { url: "https://other.example/page" });
  await waitFor(other.window, () => textOf(other, "p").includes("2024-01-05"),
    { label: "a different host to be unaffected" });
});

/* ------------------------------------------------------------------ *
 * The master switch
 * ------------------------------------------------------------------ */

test("does nothing at all when disabled", async () => {
  const dom = boot("<p>Filed on January 5, 2024 today.</p>", { enabled: false });
  await new Promise((r) => dom.window.setTimeout(r, 300));
  assert.equal(textOf(dom, "p"), "Filed on January 5, 2024 today.");
});
