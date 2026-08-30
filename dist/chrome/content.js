/* Year First — content script
 * Finds dates in page text and rewrites them as YYYY-MM-DD.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
(() => {
  "use strict";

  if (window.__yearFirstLoaded) return;
  window.__yearFirstLoaded = true;

  const api = globalThis.browser ?? globalThis.chrome;

  const DEFAULTS = {
    enabled: true,
    numericOrder: "auto",        // "auto" | "mdy" | "dmy"
    convertTimeElements: true,   // use <time datetime="..."> attributes
    convertMonthYear: false,     // "March 2024" -> "2024-03"
    showOriginal: true,          // wrap in a <span title="original text">
    highlight: true,             // dotted underline on rewritten dates
    disabledOrigins: []          // origins switched off individually
  };

  /* ------------------------------------------------------------------ *
   * Patterns
   * ------------------------------------------------------------------ */

  const MONTHS = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
    april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
    august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
    november: 11, nov: 11, december: 12, dec: 12
  };
  const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

  // "January 5, 2024" / "Jan. 5 2024" / "January 5th, 2024"
  const RE_MDY_TEXT = new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s+(\\d{4})\\b`, "gi");
  // "5 January 2024" / "5th of January, 2024"
  const RE_DMY_TEXT = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALT})\\.?,?\\s+(\\d{4})\\b`, "gi");
  // "March 2024" -> 2024-03 (opt-in: "may 2024" is often not a date)
  const RE_MY_TEXT = new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{4})\\b`, "gi");
  // The numeric patterns capture the character in front of the date instead of
  // using a lookbehind, which older WebKit can't parse. Group 1 is that
  // character and is handed back untouched.
  //
  // "2024-01-05", "2024/1/5", "2024.01.05"
  const RE_YMD = /(^|[^\d\-/.])(\d{4})([-/.])(\d{1,2})\3(\d{1,2})(?!\d|[-/.]\d)/g;
  // "05/01/2024", "5-1-2024", "05.01.2024" — order resolved at runtime
  const RE_XY4 = /(^|[^\d\-/.])(\d{1,2})([-/.])(\d{1,2})\3(\d{4})(?!\d|[-/.]\d)/g;
  // "05/01/24" — slashes only, so version strings like 1.2.3 are left alone
  const RE_XY2 = /(^|[^\d\-/.])(\d{1,2})\/(\d{1,2})\/(\d{2})(?!\d|[-/.]\d)/g;

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
    "CODE", "PRE", "KBD", "SAMP", "SVG", "MATH", "TITLE", "TEMPLATE"
  ]);

  /* ------------------------------------------------------------------ *
   * Date helpers
   * ------------------------------------------------------------------ */

  const pad = (n) => String(n).padStart(2, "0");

  function daysInMonth(y, m) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  }

  // Returns "YYYY-MM-DD", or null if the numbers aren't a real date.
  function iso(y, m, d) {
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
    if (y < 1000 || y > 2999 || m < 1 || m > 12) return null;
    if (d < 1 || d > daysInMonth(y, m)) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  // 2-digit years: 00–68 -> 2000s, 69–99 -> 1900s (the POSIX convention).
  const expandYear = (y) => (y <= 68 ? 2000 + y : 1900 + y);

  // Given the first two numbers of an ambiguous date, return [month, day].
  function orderParts(a, b, dayFirst) {
    if (a > 12 && b <= 12) return [b, a];
    if (b > 12 && a <= 12) return [a, b];
    return dayFirst ? [b, a] : [a, b];
  }

  /* ------------------------------------------------------------------ *
   * Is this page day-first or month-first?
   * ------------------------------------------------------------------ */

  const MDY_LOCALES = /^en(-(us|ph|as|gu|mp|pr|um|vi))?$/;

  function localeIsDayFirst() {
    const lang = (document.documentElement.getAttribute("lang") || navigator.language || "en-US").toLowerCase();
    return !MDY_LOCALES.test(lang);
  }

  // Look for dates on the page that can only be read one way (a part > 12)
  // and let them vote. Falls back to the page/browser language.
  function inferDayFirst() {
    const text = (document.body?.textContent || "").slice(0, 200000);
    let dmy = 0, mdy = 0, m;
    RE_XY4.lastIndex = 0;
    while ((m = RE_XY4.exec(text))) {
      const a = +m[2], b = +m[4];
      if (a > 12 && b <= 12) dmy++;
      else if (b > 12 && a <= 12) mdy++;
    }
    if (dmy !== mdy) return dmy > mdy;
    return localeIsDayFirst();
  }

  /* ------------------------------------------------------------------ *
   * Finding dates in a string
   * ------------------------------------------------------------------ */

  function findDates(text, opts) {
    const found = [];
    // offset skips the leading character captured by the numeric patterns
    const add = (m, value, offset = 0) => {
      if (!value) return;
      found.push({
        start: m.index + offset,
        end: m.index + m[0].length,
        value,
        raw: m[0].slice(offset)
      });
    };
    let m;

    RE_MDY_TEXT.lastIndex = 0;
    while ((m = RE_MDY_TEXT.exec(text))) add(m, iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]));

    RE_DMY_TEXT.lastIndex = 0;
    while ((m = RE_DMY_TEXT.exec(text))) add(m, iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]));

    RE_YMD.lastIndex = 0;
    while ((m = RE_YMD.exec(text))) add(m, iso(+m[2], +m[4], +m[5]), m[1].length);

    RE_XY4.lastIndex = 0;
    while ((m = RE_XY4.exec(text))) {
      const [mo, d] = orderParts(+m[2], +m[4], opts.dayFirst);
      add(m, iso(+m[5], mo, d), m[1].length);
    }

    RE_XY2.lastIndex = 0;
    while ((m = RE_XY2.exec(text))) {
      const [mo, d] = orderParts(+m[2], +m[3], opts.dayFirst);
      add(m, iso(expandYear(+m[4]), mo, d), m[1].length);
    }

    if (opts.convertMonthYear) {
      RE_MY_TEXT.lastIndex = 0;
      while ((m = RE_MY_TEXT.exec(text))) {
        const y = +m[2], mo = MONTHS[m[1].toLowerCase()];
        if (y >= 1000 && y <= 2999) add(m, `${y}-${pad(mo)}`);
      }
    }

    if (found.length < 2) return found;

    // Longest match wins where two patterns overlap.
    found.sort((x, y) => x.start - y.start || (y.end - y.start) - (x.end - x.start));
    const kept = [];
    let cursor = -1;
    for (const d of found) {
      if (d.start >= cursor) { kept.push(d); cursor = d.end; }
    }
    return kept;
  }

  /* ------------------------------------------------------------------ *
   * Rewriting the DOM
   * ------------------------------------------------------------------ */

  const skipCache = new WeakMap();

  function isSkipped(el) {
    if (skipCache.has(el)) return skipCache.get(el);
    let skip = false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const tag = (n.tagName || "").toUpperCase();
      if (SKIP_TAGS.has(tag) || n.isContentEditable || n.hasAttribute("data-no-year-first")) { skip = true; break; }
      if (n === document.body) break;
    }
    skipCache.set(el, skip);
    return skip;
  }

  function styleSpan(span) {
    span.style.setProperty("text-decoration", "underline dotted");
    span.style.setProperty("text-underline-offset", "2px");
    span.style.setProperty("text-decoration-color", "currentColor");
  }

  function rewriteTextNode(node, opts) {
    const text = node.nodeValue;
    if (!text || text.length < 6) return;
    const dates = findDates(text, opts);
    if (!dates.length) return;

    // Plain text swap keeps the DOM shape identical, which matters on
    // framework-rendered pages. Only build elements if asked to.
    if (!opts.showOriginal && !opts.highlight) {
      let out = "", last = 0;
      for (const d of dates) { out += text.slice(last, d.start) + d.value; last = d.end; }
      node.nodeValue = out + text.slice(last);
      return;
    }

    const frag = document.createDocumentFragment();
    let last = 0;
    for (const d of dates) {
      if (d.start > last) frag.appendChild(document.createTextNode(text.slice(last, d.start)));
      const span = document.createElement("span");
      span.className = "year-first-date";
      span.textContent = d.value;
      if (opts.showOriginal) span.title = d.raw;
      if (opts.highlight) styleSpan(span);
      frag.appendChild(span);
      last = d.end;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  function walkText(root, opts) {
    const start = root.nodeType === 1 ? root : root.parentElement;
    if (!start) return;

    if (root.nodeType === 3) {
      if (!isSkipped(start)) rewriteTextNode(root, opts);
      return;
    }
    if (isSkipped(start)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || n.nodeValue.length < 6) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || isSkipped(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    for (const n of nodes) rewriteTextNode(n, opts);
  }

  /* ---- <time datetime="..."> is the most reliable source there is ---- */

  function isoFromAttr(value) {
    if (!value) return null;
    const direct = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function rewriteTimeElements(root, opts) {
    const scope = root.nodeType === 1 ? root : root.parentElement;
    if (!scope || !scope.querySelectorAll) return;
    const list = [];
    if (scope.matches?.("time[datetime]")) list.push(scope);
    list.push(...scope.querySelectorAll("time[datetime]"));

    for (const el of list) {
      if (el.dataset.yearFirstDone === "1" || isSkipped(el)) continue;
      const value = isoFromAttr(el.getAttribute("datetime"));
      el.dataset.yearFirstDone = "1";
      if (!value) continue;
      const original = el.textContent.trim();
      if (!original || original === value) continue;
      if (opts.showOriginal && !el.title) el.title = original;
      el.textContent = value;
      if (opts.highlight) styleSpan(el);
    }
  }

  /* ------------------------------------------------------------------ *
   * Run + watch for new content
   * ------------------------------------------------------------------ */

  let opts = null;
  let observer = null;
  const pending = new Set();
  let scheduled = false;

  function process(root) {
    if (!opts || !opts.enabled) return;
    if (opts.convertTimeElements) rewriteTimeElements(root, opts);
    walkText(root, opts);
  }

  function flush() {
    scheduled = false;
    const roots = [...pending];
    pending.clear();
    for (const r of roots) {
      if (r.isConnected) process(r);
    }
    // Drop the mutation records our own edits just generated.
    observer?.takeRecords();
  }

  const defer = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 500 })
    : (fn) => setTimeout(fn, 100);

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    defer(flush);
  }

  // Per-site off switch. Deliberately a separate key from `enabled`: that one
  // is the global switch, this is a list of origins to leave alone. Keeping
  // them apart means turning a site back on cannot silently flip the master.
  function disabledHere(settings) {
    return Array.isArray(settings.disabledOrigins)
      && settings.disabledOrigins.includes(location.origin);
  }

  function start(settings) {
    opts = { ...settings };
    opts.dayFirst = settings.numericOrder === "auto"
      ? inferDayFirst()
      : settings.numericOrder === "dmy";

    if (!opts.enabled || disabledHere(opts)) return;
    process(document.body || document.documentElement);

    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") pending.add(r.target);
        else for (const n of r.addedNodes) if (n.nodeType === 1 || n.nodeType === 3) pending.add(n);
      }
      if (pending.size) schedule();
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true
    });
  }

  function getSettings() {
    try {
      const result = api.storage.sync.get(DEFAULTS);
      if (result && typeof result.then === "function") return result;
      return new Promise((resolve) => api.storage.sync.get(DEFAULTS, resolve));
    } catch {
      return Promise.resolve(DEFAULTS);
    }
  }

  getSettings().then((s) => start({ ...DEFAULTS, ...s })).catch(() => start(DEFAULTS));

  // Re-scan when settings change. Dates already rewritten stay rewritten
  // until the page is reloaded.
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    getSettings().then((s) => {
      const wasEnabled = opts?.enabled;
      observer?.disconnect();
      observer = null;
      start({ ...DEFAULTS, ...s });
      if (wasEnabled === false && opts.enabled) process(document.body);
    });
  });
})();
