// popup.js
// Shows the most recent score immediately, then tries to refresh it from the active tab.

function fmt(n, d = 2) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "--";
  return n.toFixed(d);
}

function render(rec) {
  if (!rec?.result) return;

  const { score, label, N, mu, sd, muStar, sdStar, w } = rec.result;

  document.getElementById("score").textContent = score;
  document.getElementById("label").textContent = label;

  document.getElementById("meta").innerHTML = `
    <div><span class="mono">ASIN</span>: <span class="mono">${rec.asin}</span></div>
    <div>Ratings: <span class="mono">${N}</span></div>
    <div>Mean: <span class="mono">${fmt(mu)}</span> | SD: <span class="mono">${fmt(sd)}</span></div>
    <div>Shrunk mean: <span class="mono">${fmt(muStar)}</span> | Shrunk SD: <span class="mono">${fmt(sdStar)}</span></div>
    <div>Confidence weight: <span class="mono">${fmt(w, 3)}</span></div>
  `;
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0]?.id ?? null;
}

async function requestExtractOnActiveTab() {
  const tabId = await getActiveTabId();
  if (!tabId) return false;

  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: "REQUEST_EXTRACT" });
    return !!res?.ok;
  } catch (e) {
    return false;
  }
}

async function main() {
  chrome.storage.local.get("latestScore", (data) => {
    const rec = data?.latestScore;
    if (rec) render(rec);
  });

  await requestExtractOnActiveTab();

  setTimeout(() => {
    chrome.storage.local.get("latestScore", (data) => {
      const rec = data?.latestScore;
      if (rec) render(rec);
    });
  }, 600);
}

main();