// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";

const api = globalThis.browser ?? globalThis.chrome;

const DEFAULTS = {
  enabled: true,
  numericOrder: "auto",
  convertTimeElements: true,
  convertMonthYear: false,
  showOriginal: true,
  highlight: true,
  disabledHosts: []
};

const CHECKBOXES = ["enabled", "convertTimeElements", "convertMonthYear", "showOriginal", "highlight"];

function get() {
  const result = api.storage.sync.get(DEFAULTS);
  if (result && typeof result.then === "function") return result;
  return new Promise((resolve) => api.storage.sync.get(DEFAULTS, resolve));
}

function set(values) {
  const result = api.storage.sync.set(values);
  if (result && typeof result.then === "function") return result;
  return new Promise((resolve) => api.storage.sync.set(values, resolve));
}

/* ---- preview ------------------------------------------------------- */

function render(order) {
  const dayFirst = order === "dmy" || (order === "auto" && !/^en(-us)?$/i.test(navigator.language));
  const ambiguous = dayFirst ? "2024-01-05" : "2024-05-01";
  const rows = [
    ["7 February 2024", "2024-02-07", false],
    ["Feb 7, 2024", "2024-02-07", false],
    ["23/07/2024", "2024-07-23", false],
    ["05/01/2024", ambiguous, true]
  ];
  document.getElementById("preview").innerHTML = rows.map(([from, to, flag]) => `
    <div class="preview-row${flag ? " ambiguous" : ""}">
      <span class="from">${from}</span>
      <span class="arrow">&rarr;</span>
      <span class="to">${to}</span>
    </div>`).join("");
}

/* ---- sites turned off ---------------------------------------------- *
 *
 * The only way to switch a site off is the toolbar popup, on that site. The
 * only way back on used to be the same, which meant re-enabling a site you
 * were not currently looking at required navigating to it first. This lists
 * them and takes them off the list.
 */

let disabledHosts = [];

// Hosts come from pages the user visited, so they are built as text nodes.
// The preview above uses innerHTML because every part of it is a literal in
// this file; none of this is.
function renderHosts(focusIndex = null) {
  const list = document.getElementById("siteList");
  list.textContent = "";

  if (!disabledHosts.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent =
      "None. Open the toolbar popup on a site to turn Year First off there.";
    list.appendChild(empty);
    document.getElementById("clearAllRow").hidden = true;
    if (focusIndex !== null) list.focus();
    return;
  }

  for (const host of disabledHosts) {
    const row = document.createElement("div");
    row.className = "site";

    const name = document.createElement("span");
    name.className = "host mono";
    name.textContent = host;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "linkish";
    button.textContent = "Turn back on";
    // The visible label repeats down the list, so carry the host in the
    // accessible name -- same reasoning as the date spans in content.js.
    button.setAttribute("aria-label", `Turn Year First back on for ${host}`);
    button.addEventListener("click", () => removeHost(host));

    row.append(name, button);
    list.appendChild(row);
  }
  document.getElementById("clearAllRow").hidden = disabledHosts.length < 2;

  // Removing a row destroys the button that was focused. Put focus on the
  // row that took its place, or on the list itself once it is empty.
  if (focusIndex === null) return;
  // Clamped, because removing the bottom row leaves no button at that index.
  // The empty case returns above, so there is always one to land on.
  const buttons = list.querySelectorAll("button");
  buttons[Math.min(focusIndex, buttons.length - 1)].focus();
}

function writeHosts(focusIndex) {
  renderHosts(focusIndex);
  // Written as its own key, never as part of save(), so the two cannot
  // overwrite each other's half of the settings.
  return set({ disabledHosts }).then(flashSaved);
}

function removeHost(host) {
  const at = disabledHosts.indexOf(host);
  if (at === -1) return Promise.resolve();
  disabledHosts = disabledHosts.filter((h) => h !== host);
  return writeHosts(at);
}

/* ---- wiring -------------------------------------------------------- */

let savedTimer;
function flashSaved() {
  const el = document.getElementById("saved");
  el.classList.add("show");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

function save() {
  const values = { numericOrder: document.querySelector('input[name="numericOrder"]:checked').value };
  for (const id of CHECKBOXES) values[id] = document.getElementById(id).checked;
  render(values.numericOrder);
  set(values).then(flashSaved);
}

// Sorted for a stable order, and deduplicated: the list is written by the
// popup as a Set, but it arrives here as whatever is in storage.
function normalise(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((h) => typeof h === "string" && h))].sort();
}

get().then((stored) => {
  const s = { ...DEFAULTS, ...stored };
  disabledHosts = normalise(s.disabledHosts);
  renderHosts();
  for (const id of CHECKBOXES) document.getElementById(id).checked = !!s[id];
  const radio = document.querySelector(`input[name="numericOrder"][value="${s.numericOrder}"]`)
    || document.querySelector('input[name="numericOrder"][value="auto"]');
  radio.checked = true;
  render(s.numericOrder);

  // Inputs only. The per-host controls are buttons precisely so that this
  // does not pick them up and fire a full save().
  for (const input of document.querySelectorAll("input")) {
    input.addEventListener("change", save);
  }
});

document.getElementById("clearAll").addEventListener("click", () => {
  disabledHosts = [];
  writeHosts(null);
  document.getElementById("siteList").focus();
});

// The popup writes this key too, and can be used while this page is open --
// on a second window, or on the tab behind it. Without this the list here
// goes stale and re-enabling a site would write back a list that had already
// moved on.
api.storage.onChanged?.addListener((changes, area) => {
  if (area !== "sync" || !changes.disabledHosts) return;
  disabledHosts = normalise(changes.disabledHosts.newValue);
  renderHosts();
});
