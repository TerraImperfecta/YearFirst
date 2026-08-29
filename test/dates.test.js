/* Regression tests for the date-matching logic in src/content.js.
 *
 * content.js has to ship as one self-contained IIFE with no module syntax —
 * Firefox content scripts are not modules — so there is nothing to import.
 * Instead we slice the pure section out of the source and evaluate it. The
 * slice is bounded by string markers rather than line numbers so that editing
 * content.js moves the boundaries with it; if a marker disappears the tests
 * fail loudly rather than silently testing the wrong range.
 *
 *     node --test test/
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const source = readFileSync(join(SRC, "content.js"), "utf8");

/* Everything from the month table down to the end of findDates is pure —
 * string in, {start,end,value,raw}[] out. localeIsDayFirst/inferDayFirst sit
 * inside that range and do touch document/navigator, but only in their
 * bodies, so defining them outside a browser is harmless. */
function loadPureSection() {
  const START = "const MONTHS = {";
  const END = "* Rewriting the DOM";

  const start = source.indexOf(START);
  assert.notEqual(start, -1, `marker not found in content.js: "${START}"`);
  const endMarker = source.indexOf(END);
  assert.notEqual(endMarker, -1, `marker not found in content.js: "${END}"`);
  const end = source.lastIndexOf("/* ---", endMarker);
  assert.ok(end > start, "markers found but out of order — content.js was restructured");

  const slice = source.slice(start, end);
  return new Function(
    `"use strict";\n${slice}\n` +
    "return { findDates, iso, orderParts, expandYear, daysInMonth, MONTHS };"
  )();
}

const { findDates, iso, orderParts, expandYear, daysInMonth } = loadPureSection();

const values = (text, dayFirst, convertMonthYear = false) =>
  findDates(text, { dayFirst, convertMonthYear }).map((d) => d.value);

/* ------------------------------------------------------------------ *
 * Dates that must be found
 * ------------------------------------------------------------------ */

// dayFirst: true | false | "either" (assert under both)
const CORPUS = [
  ["Published on January 5, 2024 by the committee.", "either", ["2024-01-05"]],
  ["Filed Jan. 5, 2024 in the district court.",      "either", ["2024-01-05"]],
  ["Due March 3rd, 2021 at the latest.",             "either", ["2021-03-03"]],
  ["Signed 5 January 2024 in Geneva.",               "either", ["2024-01-05"]],
  ["The 22nd of September, 1998 was a Tuesday.",     "either", ["1998-09-22"]],
  ["Reissued 7 Sept 2019 without changes.",          "either", ["2019-09-07"]],
  ["Invoice dated 23/07/2024, payable in 30 days.",  true,     ["2024-07-23"]],
  ["Meeting moved to 05/01/2024.",                   true,     ["2024-01-05"]],
  ["Meeting moved to 05/01/2024.",                   false,    ["2024-05-01"]],
  ["Contract start 1-6-2024, end 31-12-2024.",       true,     ["2024-06-01", "2024-12-31"]],
  ["Stamped 05.01.2024 at the border.",              true,     ["2024-01-05"]],
  ["Receipt: 3/4/25, no refunds.",                   true,     ["2025-04-03"]],
  ["Already tidy: 2024-1-5 needs padding.",          "either", ["2024-01-05"]],
  ["Log line 2024/03/09 14:02 UTC.",                 "either", ["2024-03-09"]],
  ["At 2024-03-09T14:02:11Z exactly.",               "either", ["2024-03-09"]],
  ["5/1/2024,3/4/2025 and 7/8/2026.",                true,     ["2024-01-05", "2025-04-03", "2026-08-07"]],
  ["23/07/2024 is the date",                         true,     ["2024-07-23"]],
];

for (const [text, dayFirst, expected] of CORPUS) {
  const modes = dayFirst === "either" ? [true, false] : [dayFirst];
  for (const mode of modes) {
    test(`finds ${JSON.stringify(expected)} in ${JSON.stringify(text)} (dayFirst=${mode})`, () => {
      assert.deepEqual(values(text, mode), expected);
    });
  }
}

/* ------------------------------------------------------------------ *
 * Text that must come back untouched, under both readings
 * ------------------------------------------------------------------ */

const UNCHANGED = [
  ["semantic version and a bare ratio", "Semantic version 2.5.1 and a ratio of 3/4."],
  ["impossible date",                   "Not a real date: 31/02/2024."],
  ["digit runs that are not dates",     "Phone extension 555 12 2024, order #05012024."],
  ["fractions",                         "Sum 1/2 + 1/2 = 1"],
  ["a year range",                      "Range 2020-2024 was busy."],
  ["longer numeric runs",               "id 05/01/2024/99 and 2024-05-01-07"],
];

for (const [label, text] of UNCHANGED) {
  for (const mode of [true, false]) {
    test(`leaves ${label} alone (dayFirst=${mode})`, () => {
      assert.deepEqual(values(text, mode), []);
    });
  }
}

/* ------------------------------------------------------------------ *
 * The month-year opt-in
 * ------------------------------------------------------------------ */

test("convertMonthYear on turns a bare month and year into YYYY-MM", () => {
  assert.deepEqual(values("Shipping in March 2024.", false, true), ["2024-03"]);
});

test("convertMonthYear off leaves a bare month and year alone", () => {
  assert.deepEqual(values("Shipping in March 2024.", false, false), []);
});

/* ------------------------------------------------------------------ *
 * Helper units
 * ------------------------------------------------------------------ */

test("iso rejects impossible dates and pads real ones", () => {
  assert.equal(iso(2024, 1, 5), "2024-01-05");
  assert.equal(iso(2024, 2, 29), "2024-02-29", "2024 is a leap year");
  assert.equal(iso(1900, 2, 29), null, "1900 is not a leap year");
  assert.equal(iso(2024, 13, 1), null);
  assert.equal(iso(2024, 0, 1), null);
  assert.equal(iso(999, 1, 1), null);
});

test("daysInMonth handles the century leap-year rule", () => {
  assert.equal(daysInMonth(2000, 2), 29, "divisible by 400");
  assert.equal(daysInMonth(1900, 2), 28, "divisible by 100 but not 400");
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2023, 2), 28);
});

test("expandYear uses the POSIX 68/69 split", () => {
  assert.equal(expandYear(0), 2000);
  assert.equal(expandYear(68), 2068);
  assert.equal(expandYear(69), 1969);
  assert.equal(expandYear(99), 1999);
});

test("orderParts lets an unambiguous part override the preference", () => {
  assert.deepEqual(orderParts(23, 7, false), [7, 23], "23 can only be a day");
  assert.deepEqual(orderParts(7, 23, true), [7, 23], "23 can only be a day");
  assert.deepEqual(orderParts(5, 1, true), [1, 5], "ambiguous, day-first");
  assert.deepEqual(orderParts(5, 1, false), [5, 1], "ambiguous, month-first");
});

/* ------------------------------------------------------------------ *
 * Guard: the no-lookbehind convention
 * ------------------------------------------------------------------ */

test("no lookbehind assertions anywhere in src/", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

  const offenders = walk(SRC)
    .filter((f) => f.endsWith(".js"))
    .filter((f) => /\(\?<[=!]/.test(readFileSync(f, "utf8")));

  assert.deepEqual(
    offenders, [],
    "lookbehind is unsupported before Safari 16.4 and an unparseable regex " +
    "literal kills the whole content script silently at load"
  );
});
