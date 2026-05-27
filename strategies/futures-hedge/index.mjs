/**
 * PORTFOLIO HEDGE — Dynamic Correlation-Weighted Beta & Volatility Term Structure Gate (Phase 3)
 *
 * Monitors total long equity exposure every 15 minutes. 
 * Calculates the portfolio's beta-weighted exposure in real-time by computing individual position betas 
 * relative to SPY using historical daily returns covariance.
 * Detects systemic volatility spikes (backwardation proxy) using the ratio of 10-day vs 30-day rolling 
 * SPY realized volatility.
 * Enters or scales a short SPY overlay dynamically based on the weighted portfolio beta:
 *   - Vol Ratio <= 1.0 (Contango): No hedge (0% short).
 *   - Vol Ratio > 1.0 (Backwardation):
 *     - Weighted Beta <= 0.8: 50% Beta-Hedged.
 *     - Weighted Beta > 0.8: 100% Beta-Hedged.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf-8"));

export const meta = {
  name: "Portfolio Hedge",
  description: "Dynamic beta-weighted SPY short overlay with daily realized volatility term structure gate.",
  scanTimes: [{ hour: 10, minute: 0 }],
  stopTime: { hour: 15, minute: 30 },
};

let pollHandle = null;
let hedgeActive = false;

async function t(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  if (!res || !res.content || !res.content[0] || !res.content[0].text) {
    return { ok: false, error: "Empty or invalid response structure" };
  }
  try {
    return JSON.parse(res.content[0].text);
  } catch (err) {
    return { ok: false, error: err.message, _raw: res.content[0].text };
  }
}

function msUntilET(hour, minute) {
  const now = new Date();
  const offsetMin = (now.getUTCMonth() + 1) >= 3 && (now.getUTCMonth() + 1) <= 11 ? 240 : 300;
  const etNow = new Date(now.getTime() - offsetMin * 60_000);
  const target = new Date(etNow);
  target.setUTCHours(hour, minute, 0, 0);
  let targetUTC = new Date(target.getTime() + offsetMin * 60_000);
  if (targetUTC <= now) targetUTC = new Date(targetUTC.getTime() + 86_400_000);
  return targetUTC.getTime() - now.getTime();
}

// ── Mathematical helpers for Beta and Volatility ─────────────────────────────

function calculateStdDev(returns) {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  return Math.sqrt(variance);
}

function calculateBeta(symbolBars, spyBars) {
  const spyMap = new Map();
  for (const bar of spyBars) {
    const dateStr = new Date(bar.t).toISOString().split('T')[0];
    spyMap.set(dateStr, bar.c);
  }

  const alignedSymbolReturns = [];
  const alignedSpyReturns = [];

  for (let i = 1; i < symbolBars.length; i++) {
    const dateStr = new Date(symbolBars[i].t).toISOString().split('T')[0];
    const prevDateStr = new Date(symbolBars[i - 1].t).toISOString().split('T')[0];

    const spyPrice = spyMap.get(dateStr);
    const prevSpyPrice = spyMap.get(prevDateStr);

    if (spyPrice && prevSpyPrice) {
      const symbolRet = (symbolBars[i].c - symbolBars[i - 1].c) / symbolBars[i - 1].c;
      const spyRet = (spyPrice - prevSpyPrice) / prevSpyPrice;
      alignedSymbolReturns.push(symbolRet);
      alignedSpyReturns.push(spyRet);
    }
  }

  if (alignedSpyReturns.length < 10) return 1.0;

  const meanSymbol = alignedSymbolReturns.reduce((a, b) => a + b, 0) / alignedSymbolReturns.length;
  const meanSpy = alignedSpyReturns.reduce((a, b) => a + b, 0) / alignedSpyReturns.length;

  let covarianceSum = 0;
  let varianceSum = 0;

  for (let i = 0; i < alignedSpyReturns.length; i++) {
    const symbolDiff = alignedSymbolReturns[i] - meanSymbol;
    const spyDiff = alignedSpyReturns[i] - meanSpy;
    covarianceSum += symbolDiff * spyDiff;
    varianceSum += spyDiff * spyDiff;
  }

  if (varianceSum === 0) return 1.0;
  return covarianceSum / varianceSum;
}

async function getBetaForSymbol(client, symbol, spyBars) {
  if (symbol === "SPY" || symbol === "SPYUSD") return 1.0;
  try {
    const symbolRes = await t(client, "prices-bars", { symbol, timeframe: "1Day", limit: 35 });
    if (!symbolRes.ok || !symbolRes.data.bars?.length) return 1.0;
    return calculateBeta(symbolRes.data.bars, spyBars);
  } catch {
    return 1.0;
  }
}

async function getSpyVolRatio(client, spyBars) {
  try {
    const returns = [];
    for (let i = 1; i < spyBars.length; i++) {
      const prev = spyBars[i - 1].c;
      const curr = spyBars[i].c;
      if (prev > 0) returns.push((curr - prev) / prev);
    }

    if (returns.length < 30) return 1.0;

    const stdDev10 = calculateStdDev(returns.slice(-10));
    const stdDev30 = calculateStdDev(returns.slice(-30));

    if (stdDev30 === 0) return 1.0;
    return stdDev10 / stdDev30;
  } catch {
    return 1.0;
  }
}

// ── Hedging execution helpers ──────────────────────────────────────────────────

async function enterShortHedge(client, state, qty, spyPrice, currentRegime) {
  await t(client, "signal-submit", {
    source: "technical", symbol: cfg.hedge_symbol, asset_class: "equity",
    direction: "short", confidence: 0.80,
    urgency: "immediate", horizon: 240,
    rationale: `Dynamic portfolio hedge. Active regime: ${currentRegime}.`,
    regime_tags: currentRegime ? [currentRegime] : [],
  });

  const preview = await t(client, "orders-preview", {
    symbol: cfg.hedge_symbol, side: "sell", qty,
    order_type: "market", time_in_force: "day",
  });

  if (!preview.ok || !preview.data.policy.allowed) {
    const why = (preview.data?.policy?.violations || []).map(v => v.message || v.rule).join("; ");
    state.log("HEDGE", `Short blocked: ${why || preview.error?.message}`);
    return;
  }

  const submit = await t(client, "orders-submit", { approval_token: preview.data.policy.approval_token });
  if (submit.ok) {
    hedgeActive = true;
    state.fills.push({ symbol: cfg.hedge_symbol, side: "short", qty, price: preview.data.preview.estimated_price || spyPrice, order_id: submit.data.order.id, time: new Date().toISOString() });
    state.log("EXEC", `✓ SHORT ${qty} ${cfg.hedge_symbol} @ ~$${(preview.data.preview.estimated_price || spyPrice).toFixed(2)} (DYNAMIC HEDGE)`);
  }
}

// ── Core assessAndHedge scan logic ────────────────────────────────────────────

async function assessAndHedge(client, state) {
  const regime = await t(client, "regime-detect", { force_refresh: false });
  const currentRegime = regime.ok ? regime.data.regime : null;
  const isHedgeRegime = currentRegime && cfg.hedge_regimes.includes(currentRegime);

  const portfolio = await t(client, "portfolio-get", {});
  if (!portfolio.ok) return;

  const positions = portfolio.data.positions || [];
  const longPositions = positions.filter(p => (p.qty ?? 0) > 0 && p.symbol !== cfg.hedge_symbol);
  
  const longExposure = longPositions.reduce((sum, p) => sum + (p.market_value ?? 0), 0);
  const shortPositions = positions.filter(p => p.symbol === cfg.hedge_symbol && (p.qty ?? 0) < 0);
  hedgeActive = shortPositions.length > 0;

  const spyBarsRes = await t(client, "prices-bars", { symbol: "SPY", timeframe: "1Day", limit: 35 });
  if (!spyBarsRes.ok || !spyBarsRes.data.bars?.length) {
    state.log("HEDGE", "Failed to fetch SPY bars for risk calculations — abort");
    return;
  }
  const spyBars = spyBarsRes.data.bars;

  const volRatio = await getSpyVolRatio(client, spyBars);
  const isBackwardation = volRatio > 1.0;

  let totalWeightedBeta = 0;
  for (const pos of longPositions) {
    const beta = await getBetaForSymbol(client, pos.symbol, spyBars);
    totalWeightedBeta += pos.market_value * beta;
    state.log("HEDGE-BETA", `${pos.symbol}: beta=${beta.toFixed(2)}, market_value=$${pos.market_value.toFixed(0)}`);
  }

  const portfolioBeta = longExposure > 0 ? totalWeightedBeta / longExposure : 1.0;
  const betaWeightedExposure = totalWeightedBeta;

  state.log("HEDGE", `Exposure: $${longExposure.toFixed(0)} | Portfolio Beta: ${portfolioBeta.toFixed(2)} | Beta-Weighted Exp: $${betaWeightedExposure.toFixed(0)} | Vol Ratio: ${volRatio.toFixed(2)} (${isBackwardation ? "Backwardation" : "Contango"}) | Regime: ${currentRegime}`);

  let hedgeRatio = 0.0;
  if (isBackwardation && isHedgeRegime && longExposure >= (cfg.long_exposure_threshold ?? 1500)) {
    hedgeRatio = portfolioBeta <= 0.8 ? 0.5 : 1.0;
  }

  const requiredShortNotional = betaWeightedExposure * hedgeRatio;

  const spyOverview = await t(client, "symbol-overview", { symbol: "SPY" });
  if (!spyOverview.ok) {
    state.log("HEDGE", "Failed to get SPY overview — abort");
    return;
  }
  const spyPrice = spyOverview.data.latest_price || 560;

  const targetQty = requiredShortNotional > 0 ? Math.max(1, Math.floor(requiredShortNotional / spyPrice)) : 0;
  const currentShortQty = hedgeActive ? Math.abs(shortPositions[0].qty) : 0;

  if (targetQty > 0) {
    if (!hedgeActive) {
      state.log("HEDGE", `Vol Ratio ${volRatio.toFixed(2)} > 1.0 & Regime ${currentRegime} — Entering dynamic SPY short (target qty: ${targetQty}, notional: $${requiredShortNotional.toFixed(0)})`);
      await enterShortHedge(client, state, targetQty, spyPrice, currentRegime);
    } else if (currentShortQty !== targetQty) {
      state.log("HEDGE", `Rebalancing SPY short from ${currentShortQty} to ${targetQty} shares (Portfolio Beta: ${portfolioBeta.toFixed(2)})`);
      const close = await t(client, "positions-close", { symbol: cfg.hedge_symbol });
      if (close.ok) {
        await enterShortHedge(client, state, targetQty, spyPrice, currentRegime);
      }
    }
  } else {
    if (hedgeActive) {
      state.log("HEDGE", `Closing hedge — Vol Ratio ${volRatio.toFixed(2)} <= 1.0 or regime normalized`);
      const close = await t(client, "positions-close", { symbol: cfg.hedge_symbol });
      if (close.ok) {
        hedgeActive = false;
        state.log("EXEC", `✓ Hedge closed`);
      }
    }
  }
}

export async function scan(client, state) {
  await assessAndHedge(client, state);

  if (pollHandle) return;

  state.log("HEDGE", `Starting 15-min exposure monitor`);
  pollHandle = setInterval(async () => {
    try {
      await assessAndHedge(client, state);
    } catch (err) {
      state.log("HEDGE", `Poll error: ${err.message}`);
    }
  }, cfg.poll_interval_ms);

  const msToExit = msUntilET(cfg.time_exit_et.hour, cfg.time_exit_et.minute);
  setTimeout(async () => {
    clearInterval(pollHandle);
    pollHandle = null;
    if (hedgeActive) {
      state.log("HEDGE", "Time exit — closing hedge");
      await t(client, "positions-close", { symbol: cfg.hedge_symbol }).catch(() => {});
      hedgeActive = false;
    }
  }, msToExit);
}

export function onStop(state) {
  if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
  state.log("SUMMARY", `Hedge fills: ${state.fills.length}`);
  for (const f of state.fills) {
    state.log("FILL", `${f.side?.toUpperCase()} ${f.qty} ${f.symbol} @ $${f.price?.toFixed(2)}`);
  }
}
