// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";

const api = globalThis.browser ?? globalThis.chrome;

const DEFAULTS = { enabled: true, highlight: true, showOriginal: true };

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

const el = {
  enabled: document.getElementById("enabled"),
  highlight: document.getElementById("highlight"),
  showOriginal: document.getElementById("showOriginal"),
  state: document.getElementById("state"),
  reload: document.getElementById("reload")
};

function paint(enabled) {
  document.body.classList.toggle("off", !enabled);
  el.state.textContent = enabled ? "On for every site" : "Off — pages left alone";
}

get().then((stored) => {
  const s = { ...DEFAULTS, ...stored };
  el.enabled.checked = s.enabled;
  el.highlight.checked = s.highlight;
  el.showOriginal.checked = s.showOriginal;
  paint(s.enabled);
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
