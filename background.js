// background.js (MV3 service worker)

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

function percToCounts(perc, N) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;

  for (let k = 1; k <= 5; k++) {
    const p = Number(perc?.[k] ?? 0);
    const c = Math.round((p / 100) * N);
    counts[k] = c;
    sum += c;
  }

  const drift = N - sum;
  if (drift !== 0) {
    let bestK = 5;
    for (let k = 1; k <= 5; k++) if (counts[k] > counts[bestK]) bestK = k;
    counts[bestK] += drift;
  }

  return counts;
}

function meanSdFromCounts(counts) {
  const N =
    (counts[1] ?? 0) +
    (counts[2] ?? 0) +
    (counts[3] ?? 0) +
    (counts[4] ?? 0) +
    (counts[5] ?? 0);

  if (!Number.isFinite(N) || N <= 0) return { N: 0, mean: NaN, sd: NaN };

  let mean = 0;
  for (let k = 1; k <= 5; k++) mean += k * (counts[k] ?? 0);
  mean /= N;

  let variance = 0;
  for (let k = 1; k <= 5; k++) {
    const nk = counts[k] ?? 0;
    const d = k - mean;
    variance += nk * d * d;
  }
  variance /= N;

  return { N, mean, sd: Math.sqrt(variance) };
}

function computeScore(counts) {
  const { N, mean: mu, sd } = meanSdFromCounts(counts);

  const mu0 = 3.8;
  const sd0 = 0.9;
  const k0 = 200;
  const lambda = 0.6;

  const w = N / (N + k0);
  const muStar = w * mu + (1 - w) * mu0;
  const sdStar = w * sd + (1 - w) * sd0;

  // SD penalty scaled by confidence, so small N does not get smashed
  const r = muStar - (lambda * w) * sdStar;

  const score = clamp(Math.round(25 * (r - 1)), 0, 100);

  const label =
    score >= 80 ? "Strong" :
    score >= 60 ? "Decent" :
    score >= 40 ? "Mixed" : "Risk";

  return { score, label, N, mu, sd, w, muStar, sdStar, r };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "RATING_DATA") return;

  const { asin, N, perc } = msg.payload || {};
  if (!asin || !N || !perc) return;

  const counts = percToCounts(perc, N);
  const result = computeScore(counts);

  const record = { asin, N, perc, counts, result, ts: Date.now() };

  chrome.storage.local.set({ ["asin:" + asin]: record, latestScore: record });

  if (sender?.tab?.id) {
    chrome.action.setBadgeText({ text: String(result.score), tabId: sender.tab.id });
  }

  sendResponse?.({ ok: true, asin, result });
  return true;
});