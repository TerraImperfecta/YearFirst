// SPDX-License-Identifier: MPL-2.0
"use strict";

const api = globalThis.browser ?? globalThis.chrome;

const DEFAULTS = { enabled: true, highlight: true, showOriginal: true, disabledOrigins: [] };

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
// extra permission is needed. Only http(s) origins can be switched off --
// there is nothing to rewrite on about: or the extension's own pages.
async function activeOrigin() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return null;
    const url = new URL(tab.url);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
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

let origin = null;
let disabled = [];
const hostOf = (o) => { try { return new URL(o).host; } catch { return o; } };

function paint(enabled) {
  document.body.classList.toggle("off", !enabled);
  if (!enabled) el.state.textContent = "Off — pages left alone";
  else if (origin && disabled.includes(origin)) el.state.textContent = "Off on " + hostOf(origin);
  else el.state.textContent = "On for every site";
}

(async () => {
  const s = { ...DEFAULTS, ...(await get()) };
  el.enabled.checked = s.enabled;
  el.highlight.checked = s.highlight;
  el.showOriginal.checked = s.showOriginal;
  disabled = Array.isArray(s.disabledOrigins) ? s.disabledOrigins : [];

  origin = await activeOrigin();
  if (origin) {
    el.siteHost.textContent = hostOf(origin);
    el.siteOff.checked = disabled.includes(origin);
    el.siteRow.hidden = false;
  }
  paint(s.enabled);
})();

// Same reasoning as the master switch: dates already rewritten only revert on
// a fresh load, so switching a site off reloads it straight away.
el.siteOff.addEventListener("change", async () => {
  if (!origin) return;
  const next = new Set(disabled);
  if (el.siteOff.checked) next.add(origin); else next.delete(origin);
  disabled = [...next];
  paint(el.enabled.checked);
  await set({ disabledOrigins: disabled });
  const reloaded = await reloadActiveTab();
  if (reloaded) window.close();
  else el.reload.hidden = false;
});

// The master switch reloads straight away: dates already rewritten only
// revert on a fresh load.
el.enabled.addEventListener("change", async () => {
  paint(el.enabled.checked);
  await set({ enabled: el.enabled.checked });
  const reloaded = await reloadActiveTab();
  if (reloaded) window.close();
  else el.reload.hidden = false;
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
