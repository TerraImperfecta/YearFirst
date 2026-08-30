// SPDX-License-Identifier: MPL-2.0
"use strict";

const api = globalThis.browser ?? globalThis.chrome;

const DEFAULTS = {
  enabled: true,
  numericOrder: "auto",
  convertTimeElements: true,
  convertMonthYear: false,
  showOriginal: true,
  highlight: true
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

get().then((stored) => {
  const s = { ...DEFAULTS, ...stored };
  for (const id of CHECKBOXES) document.getElementById(id).checked = !!s[id];
  const radio = document.querySelector(`input[name="numericOrder"][value="${s.numericOrder}"]`)
    || document.querySelector('input[name="numericOrder"][value="auto"]');
  radio.checked = true;
  render(s.numericOrder);

  for (const input of document.querySelectorAll("input")) {
    input.addEventListener("change", save);
  }
});
