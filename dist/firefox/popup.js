// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";

const api = globalThis.browser ?? globalThis.chrome;

const DEFAULTS = { enabled: true, highlight: true, showOriginal: true, disabledHosts: [] };

function get() {
  const r = api.storage.sync.get(DEFAULTS);
  return r && typeof r.then === "function"
    ? r
    : new Promise((resolve) => api.storage.sync.get(DEFAULTS, resolve));
}

function set(values) {
  const r = api.storage.sync.set(values);
  return r && typeof r.then === "function"
    ? r
    : new Promise((resolve) => api.storage.sync.set(values, resolve));
}

// Turning something back ON is applied in place by the content script, which
// is already running on the page -- no reload, so no flash of the page coming
// back and no dates visibly rewriting themselves a moment later.
//
// Turning OFF still reloads. Once a date has been swapped, the original text
// is gone, so there is nothing to put back without a fresh load.
async function applyInPlace() {
  let tab;
  try {
    [tab] = await api.tabs.query({ active: true, currentWindow: true });
  } catch {
    return false;
  }
  if (tab?.id == null) return false;
  try {
    const reply = await ask(tab.id, { type: "year-first:apply" });
    return !!(reply && reply.applied);
  } catch {
    // No content script on this page -- it predates the install, or it is a
    // page we are not injected into. A reload is the only way through.
    return false;
  }
}

// `turningOff` decides which of the two paths above applies. Either way the
// popup closes once the page reflects the new setting, and falls back to
// offering a manual reload if it could not be reached.
async function settle(turningOff) {
  if (!turningOff && await applyInPlace()) {
    window.close();
    return;
  }
  if (await reloadActiveTab()) window.close();
  else el.reload.hidden = false;
}

async function reloadActiveTab() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) await api.tabs.reload(tab.id);
    return true;
  } catch {
    return false;
  }
}

// activeTab gives us the URL of the tab the popup was opened over, so no
// extra permission is needed. Only http(s) pages can be switched off -- there
// is nothing to rewrite on about: or the extension's own pages.
//
// Returns host: hostname plus port. That is exactly what the row displays and
// exactly what content.js matches on.
function hostOfUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.host : null;
  } catch {
    return null;
  }
}

// Promise or callback, depending on the browser.
function ask(tabId, message) {
  const r = api.tabs.sendMessage(tabId, message);
  if (r && typeof r.then === "function") return r;
  return new Promise((resolve) => api.tabs.sendMessage(tabId, message, resolve));
}

async function activeHost() {
  let tab;
  try {
    [tab] = await api.tabs.query({ active: true, currentWindow: true });
  } catch {
    return null;
  }

  // Chrome and Firefox hand us the URL directly.
  const direct = tab?.url ? hostOfUrl(tab.url) : null;
  if (direct) return direct;

  // Safari does not, through activeTab. Ask the content script, which is
  // already running on the page. No extra permission: if it is running there,
  // we may talk to it.
  if (tab?.id == null) return null;
  try {
    const reply = await ask(tab.id, { type: "year-first:host" });
    const host = reply && reply.host;
    return typeof host === "string" && host ? host : null;
  } catch {
    return null;
  }
}

const el = {
  enabled: document.getElementById("enabled"),
  highlight: document.getElementById("highlight"),
  showOriginal: document.getElementById("showOriginal"),
  state: document.getElementById("state"),
  reload: document.getElementById("reload"),
  siteRow: document.getElementById("siteRow"),
  siteOff: document.getElementById("siteOff"),
  siteHost: document.getElementById("siteHost")
};

let host = null;
let disabled = [];

function paint(enabled) {
  document.body.classList.toggle("off", !enabled);
  if (!enabled) el.state.textContent = "Off — pages left alone";
  else if (host && disabled.includes(host)) el.state.textContent = "Off on " + host;
  else el.state.textContent = "On for every site";
}

(async () => {
  const s = { ...DEFAULTS, ...(await get()) };
  el.enabled.checked = s.enabled;
  el.highlight.checked = s.highlight;
  el.showOriginal.checked = s.showOriginal;
  disabled = Array.isArray(s.disabledHosts) ? s.disabledHosts : [];

  host = await activeHost();
  if (host) {
    el.siteHost.textContent = host;
    el.siteOff.checked = disabled.includes(host);
    el.siteRow.hidden = false;
  }
  paint(s.enabled);
})();

// Switching a site OFF reloads it: rewritten dates only revert on a fresh
// load. Switching it back on is applied in place -- see settle().
el.siteOff.addEventListener("change", async () => {
  if (!host) return;
  const next = new Set(disabled);
  if (el.siteOff.checked) next.add(host); else next.delete(host);
  disabled = [...next];
  paint(el.enabled.checked);
  await set({ disabledHosts: disabled });
  await settle(el.siteOff.checked);
});

// Same split as the per-site switch: off reloads, on applies in place.
el.enabled.addEventListener("change", async () => {
  paint(el.enabled.checked);
  await set({ enabled: el.enabled.checked });
  await settle(!el.enabled.checked);
});

// Appearance changes apply to dates found from now on, so offer the reload
// rather than forcing it — you might be mid-form.
for (const key of ["highlight", "showOriginal"]) {
  el[key].addEventListener("change", async () => {
    await set({ [key]: el[key].checked });
    el.reload.hidden = false;
  });
}

el.reload.addEventListener("click", async () => {
  await reloadActiveTab();
  window.close();
});

document.getElementById("settings").addEventListener("click", () => {
  api.runtime.openOptionsPage();
  window.close();
});
