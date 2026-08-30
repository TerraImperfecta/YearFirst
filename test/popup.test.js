/* Tests for the toolbar popup, which had no coverage at all until the
 * per-site row turned out to be missing on Safari.
 *
 * The popup is a separate document and script from the content script, so
 * these load popup.html, strip its script tag, and inject popup.js by hand
 * with a fake extension API underneath.
 *
 *     node --test test/*.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const HTML = readFileSync(join(SRC, "popup.html"), "utf8").replace(
  /<script src="popup\.js"><\/script>/, "");
const SCRIPT = readFileSync(join(SRC, "popup.js"), "utf8");

/* `tab` is what tabs.query resolves to. `contentHost` is what the content
 * script answers when asked -- null means no answer, as on a page where it
 * is not running. `applied` is what it answers to year-first:apply; null
 * means no answer, the same "no content script here" case. */
function boot({ tab = {}, contentHost = null, stored = {}, applied = true } = {}) {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://extension/popup.html" });
  const { window } = dom;
  const calls = { set: [], sent: [], reloaded: 0 };

  window.chrome = {
    storage: {
      sync: {
        get: (defaults) => Promise.resolve({ ...defaults, ...stored }),
        set: (values) => { calls.set.push(values); return Promise.resolve(); },
      },
      onChanged: { addListener() {} },
    },
    tabs: {
      query: () => Promise.resolve([tab]),
      reload: () => { calls.reloaded++; return Promise.resolve(); },
      sendMessage: (id, msg) => {
        calls.sent.push({ id, msg });
        if (msg?.type === "year-first:apply") {
          return Promise.resolve(applied === null ? undefined : { applied });
        }
        return Promise.resolve(contentHost === null ? undefined : { host: contentHost });
      },
    },
    runtime: { openOptionsPage() {} },
  };

  const s = window.document.createElement("script");
  s.textContent = SCRIPT;
  window.document.body.appendChild(s);
  return { dom, window, calls };
}

/* Node's timer, deliberately: the popup calls window.close() on some paths,
 * and a callback scheduled on a closed jsdom window never runs. */
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 * Finding out which site the popup is looking at
 * ------------------------------------------------------------------ */

test("uses the tab URL when the browser provides one", async () => {
  const { window, calls } = boot({ tab: { id: 1, url: "https://nodejs.org/en/about" } });
  await settle();
  const row = window.document.getElementById("siteRow");
  assert.equal(row.hidden, false, "the per-site row should be shown");
  assert.equal(window.document.getElementById("siteHost").textContent, "nodejs.org");
  assert.equal(calls.sent.length, 0, "no need to ask the content script");
});

test("asks the content script when the browser gives no tab URL", async () => {
  // Safari does not expose tab.url through activeTab. This is the case that
  // left the row hidden and the feature invisible.
  const { window, calls } = boot({ tab: { id: 7 }, contentHost: "nodejs.org" });
  await settle();
  assert.equal(window.document.getElementById("siteRow").hidden, false,
    "the row must appear even without a tab URL");
  assert.equal(window.document.getElementById("siteHost").textContent, "nodejs.org");
  assert.equal(calls.sent.length, 1);
  assert.equal(calls.sent[0].id, 7);
  assert.equal(calls.sent[0].msg.type, "year-first:host");
});

test("hides the row when neither the tab nor the content script answers", async () => {
  const { window } = boot({ tab: { id: 3 }, contentHost: null });
  await settle();
  assert.equal(window.document.getElementById("siteRow").hidden, true,
    "nothing to switch off, so offer nothing");
});

test("hides the row on a page the extension cannot act on", async () => {
  const { window } = boot({ tab: { id: 4, url: "about:blank" } });
  await settle();
  assert.equal(window.document.getElementById("siteRow").hidden, true);
});

test("keeps the port in the host, so localhost:3000 is its own site", async () => {
  const { window } = boot({ tab: { id: 5, url: "http://localhost:3000/x" } });
  await settle();
  assert.equal(window.document.getElementById("siteHost").textContent, "localhost:3000");
});

/* ------------------------------------------------------------------ *
 * Switching a site off
 * ------------------------------------------------------------------ */

test("checking the row stores the host and reloads the page", async () => {
  const { window, calls } = boot({ tab: { id: 9 }, contentHost: "example.com" });
  await settle();
  const box = window.document.getElementById("siteOff");
  assert.equal(box.checked, false);

  box.checked = true;
  box.dispatchEvent(new window.Event("change"));
  await settle();

  assert.deepEqual(JSON.parse(JSON.stringify(calls.set.at(-1))), { disabledHosts: ["example.com"] });
  assert.equal(calls.reloaded, 1, "dates already rewritten only revert on a reload");
});

test("shows the row already checked for a site that is switched off", async () => {
  const { window } = boot({
    tab: { id: 9 }, contentHost: "example.com",
    stored: { disabledHosts: ["example.com"] },
  });
  await settle();
  assert.equal(window.document.getElementById("siteOff").checked, true);
  assert.match(window.document.getElementById("state").textContent, /Off on example\.com/);
});

test("unchecking removes only that host", async () => {
  const { window, calls } = boot({
    tab: { id: 9 }, contentHost: "example.com",
    stored: { disabledHosts: ["example.com", "other.example"] },
  });
  await settle();
  const box = window.document.getElementById("siteOff");
  box.checked = false;
  box.dispatchEvent(new window.Event("change"));
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(calls.set.at(-1))), { disabledHosts: ["other.example"] });
});

/* ------------------------------------------------------------------ *
 * Switching back on, which does not need a reload
 *
 * The content script is already on the page and can rewrite in place. A
 * reload here was visible as a flash of the page reloading, then the dates
 * changing under it a moment later.
 * ------------------------------------------------------------------ */

const applyCalls = (calls) =>
  calls.sent.filter((c) => c.msg?.type === "year-first:apply");

test("turning a site back on applies in place instead of reloading", async () => {
  const { window, calls } = boot({
    tab: { id: 9 }, contentHost: "example.com",
    stored: { disabledHosts: ["example.com"] },
  });
  await settle();
  const box = window.document.getElementById("siteOff");
  box.checked = false;
  box.dispatchEvent(new window.Event("change"));
  await settle();

  assert.equal(applyCalls(calls).length, 1, "should ask the page to apply");
  assert.equal(calls.reloaded, 0, "and not reload it");
});

test("turning a site off still reloads, since the original text is gone", async () => {
  const { window, calls } = boot({ tab: { id: 9 }, contentHost: "example.com" });
  await settle();
  const box = window.document.getElementById("siteOff");
  box.checked = true;
  box.dispatchEvent(new window.Event("change"));
  await settle();

  assert.equal(applyCalls(calls).length, 0, "nothing to apply when switching off");
  assert.equal(calls.reloaded, 1);
});

test("the master switch splits the same way", async () => {
  const on = boot({ tab: { id: 9 }, contentHost: "example.com", stored: { enabled: false } });
  await settle();
  const onBox = on.window.document.getElementById("enabled");
  onBox.checked = true;
  onBox.dispatchEvent(new on.window.Event("change"));
  await settle();
  assert.equal(on.calls.reloaded, 0, "turning on applies in place");
  assert.equal(applyCalls(on.calls).length, 1);

  const off = boot({ tab: { id: 9 }, contentHost: "example.com" });
  await settle();
  const offBox = off.window.document.getElementById("enabled");
  offBox.checked = false;
  offBox.dispatchEvent(new off.window.Event("change"));
  await settle();
  assert.equal(off.calls.reloaded, 1, "turning off reloads");
});

test("falls back to reloading when the page has no content script", async () => {
  const { window, calls } = boot({
    tab: { id: 9 }, contentHost: "example.com", applied: null,
    stored: { disabledHosts: ["example.com"] },
  });
  await settle();
  const box = window.document.getElementById("siteOff");
  box.checked = false;
  box.dispatchEvent(new window.Event("change"));
  await settle();

  assert.equal(applyCalls(calls).length, 1, "it asks first");
  assert.equal(calls.reloaded, 1, "then reloads because nothing answered");
});

test("falls back to reloading when the page answers that it did not apply", async () => {
  const { window, calls } = boot({
    tab: { id: 9 }, contentHost: "example.com", applied: false,
    stored: { disabledHosts: ["example.com"] },
  });
  await settle();
  const box = window.document.getElementById("siteOff");
  box.checked = false;
  box.dispatchEvent(new window.Event("change"));
  await settle();
  assert.equal(calls.reloaded, 1);
});
