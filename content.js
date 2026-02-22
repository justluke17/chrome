// content.js
// Extract total ratings count + star histogram percentages from Amazon product pages.
// Sends {asin, N, perc} to background.js.

const DEBUG = true; // set to false once working
function log(...args) { if (DEBUG) console.log("[ARCS content]", ...args); }

(function setDebugMarkers() {
  try {
    document.documentElement.setAttribute("data-arcs-injected", "1");
    document.documentElement.setAttribute("data-arcs-ext-id", chrome.runtime.id);
  } catch (e) {}
})();

function parseNumber(text) {
  const cleaned = (text || "").replace(/[^\d]/g, "");
  return cleaned ? Number(cleaned) : null;
}

function getAsin() {
  const path = location.pathname;

  let m = path.match(/\/dp\/([A-Z0-9]{10})/);
  if (m) return m[1];

  m = path.match(/\/gp\/product\/([A-Z0-9]{10})/);
  if (m) return m[1];

  const asinInput = document.querySelector('input#ASIN, input[name="ASIN"]');
  if (asinInput?.value) return asinInput.value;

  const asinAttr =
    document.querySelector("[data-asin]")?.getAttribute("data-asin") ||
    document.body?.getAttribute("data-asin");
  if (asinAttr && asinAttr.length === 10) return asinAttr;

  return null;
}

function extractRatingsCount() {
  const el =
    document.querySelector("#acrCustomerReviewText") ||
    document.querySelector('[data-hook="total-review-count"]') ||
    document.querySelector('[data-hook="total-rating-count"]') ||
    document.querySelector("#acrPopover");

  if (!el) return null;
  return parseNumber(el.textContent || "");
}

function extractHistogramPerc() {
  const perc = {};

  // Common: explicit hook
  const table =
    document.querySelector('[data-hook="histogram-table"]') ||
    document.querySelector("#histogramTable");

  if (table) {
    // Often stored in aria-label on the clickable bars
    const ariaEls = Array.from(table.querySelectorAll('[aria-label*="%"]'));
    for (const el of ariaEls) {
      const t = (el.getAttribute("aria-label") || "").trim();
      const m = t.match(/(\d)\s*star.*?(\d+)\s*%/i);
      if (m) perc[Number(m[1])] = Number(m[2]);
    }

    // Fallback: parse visible text
    if (Object.keys(perc).length === 0) {
      const rows = Array.from(table.querySelectorAll("tr"));
      for (const row of rows) {
        const txt = row.textContent || "";
        const starMatch = txt.match(/(\d)\s*star/i);
        const pctMatch = txt.match(/(\d+)\s*%/);
        if (starMatch && pctMatch) perc[Number(starMatch[1])] = Number(pctMatch[1]);
      }
    }
  }

  // Last resort: limited scan
  if (Object.keys(perc).length === 0) {
    const ariaEls = Array.from(document.querySelectorAll('[aria-label*="star"][aria-label*="%"]'));
    for (const el of ariaEls) {
      const t = (el.getAttribute("aria-label") || "").trim();
      const m = t.match(/(\d)\s*star.*?(\d+)\s*%/i);
      if (m) perc[Number(m[1])] = Number(m[2]);
    }
  }

  return Object.keys(perc).length >= 3 ? perc : null;
}

function trySend() {
  const asin = getAsin();
  const N = extractRatingsCount();
  const perc = extractHistogramPerc();

  log("trySend", { asin, N, percKeys: perc ? Object.keys(perc) : null });

  if (!asin || !N || !perc) return false;

  chrome.runtime.sendMessage({
    type: "RATING_DATA",
    payload: { asin, N, perc }
  });

  log("sent RATING_DATA", { asin, N, perc });
  return true;
}

// Amazon injects the ratings module late, so observe DOM changes
(function runWithObserver() {
  if (trySend()) return;

  const obs = new MutationObserver(() => {
    if (trySend()) obs.disconnect();
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 20000);
})();

// Allow popup to trigger extraction
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "REQUEST_EXTRACT") return;
  const ok = trySend();
  sendResponse?.({ ok });
  return true;
});