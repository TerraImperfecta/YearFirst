/* Tests for the settings page's "sites turned off" list.
 *
 * Same harness as popup.test.js: load options.html, strip its script tag,
 * inject options.js with a fake extension API underneath.
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
const HTML = readFileSync(join(SRC, "options.html"), "utf8").replace(
  /<script src="options\.js"><\/script>/, "");
const SCRIPT = readFileSync(join(SRC, "options.js"), "utf8");

function boot({ stored = {} } = {}) {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://extension/options.html" });
  const { window } = dom;
  const calls = { set: [] };
  let onChanged = null;

  window.chrome = {
    storage: {
      sync: {
        get: (defaults) => Promise.resolve({ ...defaults, ...stored }),
        set: (values) => { calls.set.push(values); return Promise.resolve(); },
      },
      onChanged: { addListener: (fn) => { onChanged = fn; } },
    },
  };

  const s = window.document.createElement("script");
  s.textContent = SCRIPT;
  window.document.body.appendChild(s);
  return { window, calls, fire: (...a) => onChanged(...a) };
}

const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

const hosts = (window) =>
  [...window.document.querySelectorAll("#siteList .host")].map((el) => el.textContent);
const buttons = (window) =>
  [...window.document.querySelectorAll("#siteList button")];

/* ------------------------------------------------------------------ *
 * Showing the list
 * ------------------------------------------------------------------ */

test("lists the disabled hosts, sorted", async () => {
  const { window } = boot({ stored: { disabledHosts: ["news.ycombinator.com", "github.com"] } });
  await settle();
  assert.deepEqual(hosts(window), ["github.com", "news.ycombinator.com"]);
});

test("says how to add one when the list is empty", async () => {
  const { window } = boot({ stored: { disabledHosts: [] } });
  await settle();
  assert.equal(hosts(window).length, 0);
  const text = window.document.querySelector("#siteList .empty").textContent;
  assert.match(text, /toolbar popup/, "the empty state should say where sites get turned off");
});

test("deduplicates and drops junk rather than rendering it", async () => {
  const { window } = boot({
    stored: { disabledHosts: ["a.example", "a.example", "", null, 7, "b.example"] },
  });
  await settle();
  assert.deepEqual(hosts(window), ["a.example", "b.example"]);
});

test("survives a non-array value in storage", async () => {
  const { window } = boot({ stored: { disabledHosts: "github.com" } });
  await settle();
  assert.deepEqual(hosts(window), []);
});

test("host names are text, not markup", async () => {
  const { window } = boot({ stored: { disabledHosts: ["<img src=x onerror=1>"] } });
  await settle();
  const cell = window.document.querySelector("#siteList .host");
  assert.equal(cell.textContent, "<img src=x onerror=1>");
  assert.equal(cell.querySelector("img"), null, "must not be parsed as HTML");
});

/* ------------------------------------------------------------------ *
 * Taking sites off the list
 * ------------------------------------------------------------------ */

test("turning a site back on removes it and writes only that key", async () => {
  const { window, calls } = boot({ stored: { disabledHosts: ["github.com", "z.example"] } });
  await settle();
  buttons(window)[0].click();
  await settle();

  assert.deepEqual(hosts(window), ["z.example"]);
  assert.equal(calls.set.length, 1);
  assert.deepEqual([...Object.keys(calls.set[0])], ["disabledHosts"],
    "must not write the checkbox settings back alongside");
  assert.deepEqual([...calls.set[0].disabledHosts], ["z.example"]);
});

test("clear-all empties the list", async () => {
  const { window, calls } = boot({ stored: { disabledHosts: ["a.example", "b.example"] } });
  await settle();
  window.document.getElementById("clearAll").click();
  await settle();
  assert.deepEqual(hosts(window), []);
  assert.deepEqual([...calls.set.at(-1).disabledHosts], []);
});

test("clear-all is hidden unless it would do more than one row's work", async () => {
  const one = boot({ stored: { disabledHosts: ["a.example"] } });
  await settle();
  assert.equal(one.window.document.getElementById("clearAllRow").hidden, true);

  const two = boot({ stored: { disabledHosts: ["a.example", "b.example"] } });
  await settle();
  assert.equal(two.window.document.getElementById("clearAllRow").hidden, false);
});

test("focus lands on the row that took the removed one's place", async () => {
  const { window } = boot({
    stored: { disabledHosts: ["a.example", "b.example", "c.example"] },
  });
  await settle();
  buttons(window)[1].click();          // remove b
  await settle();
  assert.equal(window.document.activeElement.getAttribute("aria-label"),
    "Turn Year First back on for c.example");
});

test("removing the bottom row moves focus up, not off the end", async () => {
  const { window } = boot({ stored: { disabledHosts: ["a.example", "b.example"] } });
  await settle();
  buttons(window)[1].click();          // remove the last one
  await settle();
  assert.equal(window.document.activeElement.getAttribute("aria-label"),
    "Turn Year First back on for a.example");
});

test("removing the last row does not strand focus on a dead button", async () => {
  const { window } = boot({ stored: { disabledHosts: ["only.example"] } });
  await settle();
  buttons(window)[0].click();
  await settle();
  assert.equal(window.document.activeElement.id, "siteList");
});

/* ------------------------------------------------------------------ *
 * Staying in step with the popup
 * ------------------------------------------------------------------ */

test("picks up a host the popup added while this page was open", async () => {
  const { window, fire } = boot({ stored: { disabledHosts: ["a.example"] } });
  await settle();
  fire({ disabledHosts: { newValue: ["a.example", "new.example"] } }, "sync");
  await settle();
  assert.deepEqual(hosts(window), ["a.example", "new.example"]);
});

test("ignores changes to other keys and other storage areas", async () => {
  const { window, fire } = boot({ stored: { disabledHosts: ["a.example"] } });
  await settle();
  fire({ enabled: { newValue: false } }, "sync");
  fire({ disabledHosts: { newValue: [] } }, "local");
  await settle();
  assert.deepEqual(hosts(window), ["a.example"]);
});

/* ------------------------------------------------------------------ *
 * Not disturbing what was already there
 * ------------------------------------------------------------------ */

test("the settings checkboxes still save, and do not touch disabledHosts", async () => {
  const { window, calls } = boot({
    stored: { disabledHosts: ["a.example"], highlight: true },
  });
  await settle();
  const box = window.document.getElementById("highlight");
  box.checked = false;
  box.dispatchEvent(new window.Event("change"));
  await settle();

  assert.equal(calls.set.length, 1);
  assert.equal(calls.set[0].highlight, false);
  assert.ok(!("disabledHosts" in calls.set[0]),
    "a settings save must leave the host list alone");
});

test("the per-host controls are not inputs, so save() cannot pick them up", async () => {
  const { window } = boot({ stored: { disabledHosts: ["a.example"] } });
  await settle();
  assert.equal(window.document.querySelectorAll("#siteList input").length, 0);
});
