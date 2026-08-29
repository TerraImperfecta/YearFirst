"use strict";

const api = globalThis.browser ?? globalThis.chrome;

async function refreshBadge() {
  let enabled = true;
  try {
    const stored = await api.storage.sync.get({ enabled: true });
    enabled = stored.enabled !== false;
  } catch { /* fall through to the default */ }

  try {
    await api.action.setBadgeText({ text: enabled ? "" : "off" });
    await api.action.setBadgeBackgroundColor({ color: "#5c6570" });
    if (api.action.setBadgeTextColor) await api.action.setBadgeTextColor({ color: "#ffffff" });
    await api.action.setTitle({
      title: enabled ? "Year First" : "Year First — not rewriting"
    });
  } catch { /* action API unavailable */ }
}

api.runtime.onStartup.addListener(refreshBadge);
api.runtime.onInstalled.addListener(refreshBadge);
api.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled) refreshBadge();
});

refreshBadge();
