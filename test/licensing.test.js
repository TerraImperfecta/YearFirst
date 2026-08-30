/* Year First is dual licensed by distribution channel: GPL-3.0 everywhere
 * except Safari, which ships MPL-2.0 because GPLv3 cannot lawfully be
 * distributed through the App Store. Getting that wrong is silent and only
 * surfaces at review, so assert it on the built output.
 *
 *     node --test test/*.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DIST = join(ROOT, "dist");

const EXPECTED = {
  firefox: { spdx: "GPL-3.0-or-later", marker: "GNU GENERAL PUBLIC LICENSE" },
  chrome:  { spdx: "GPL-3.0-or-later", marker: "GNU GENERAL PUBLIC LICENSE" },
  safari:  { spdx: "MPL-2.0",          marker: "Mozilla Public License Version 2.0" },
};

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});

for (const [target, { spdx, marker }] of Object.entries(EXPECTED)) {
  const out = join(DIST, target);

  test(`${target}: ships a LICENSE file`, () => {
    assert.ok(existsSync(join(out, "LICENSE")),
      `dist/${target}/LICENSE is missing — the licence text must accompany ` +
      "the distributed work, and what is distributed is this folder");
  });

  test(`${target}: ships the ${spdx} licence text`, () => {
    const text = readFileSync(join(out, "LICENSE"), "utf8");
    assert.ok(text.includes(marker),
      `dist/${target}/LICENSE does not look like ${spdx} (expected to find ` +
      `${JSON.stringify(marker)})`);
  });

  test(`${target}: every shipped .js is tagged ${spdx}`, () => {
    const wrong = walk(out)
      .filter((f) => f.endsWith(".js"))
      .filter((f) => !readFileSync(f, "utf8").includes(`SPDX-License-Identifier: ${spdx}`));

    assert.deepEqual(wrong.map((f) => f.slice(ROOT.length + 1)), [],
      `these ship in the ${target} build but are not tagged ${spdx}, so the ` +
      "file contradicts the LICENSE beside it");
  });
}

test("the two licence texts both exist at the repo root", () => {
  assert.ok(existsSync(join(ROOT, "LICENSE")), "LICENSE (GPL-3.0) missing");
  assert.ok(existsSync(join(ROOT, "LICENSE.MPL")), "LICENSE.MPL missing");
});
