/**
 * PAIR TRADING (Statistical Arbitrage via Cointegration Spread)
 *
 * Scans traditionally cointegrated pairs.
 * Calculates rolling beta: Beta = Covariance(A, B) / Variance(B).
 * Spread = PriceA - Beta * PriceB.
 * Generates rolling Z-score.
 * When Z-Score > 2.0 (Leg A overpriced, Leg B underpriced): Sell A (Short), Buy B (Long).
 * When Z-Score < -2.0 (Leg A underpriced, Leg B overpriced): Buy A (Long), Sell B (Short).
 * Exits when Z-score reverts near 0 (e.g. ±0.2).
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf-8"));

export const meta = {
  name: "Pair Trading — Statistical Arbitrage",
  description: "Cointegration spread Z-score, long/short leg execution.",
  scanTimes: [
    { hour: 10, minute: 0 },
    { hour: 12, minute: 30 },
    { hour: 14, minute: 0 },
  ],
  stopTime: { hour: 15, minute: 59 },
};

const activePairs = new Map(); // pairKey -> { side, beta, qtyA, qtyB, entryZ }
const monitors = new Map();

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

function calculateBetaAndSpread(barsA, barsB, lookback) {
  const limit = Math.min(barsA.length, barsB.length, lookback);
  if (limit < 5) return null;

  const pricesA = barsA.slice(-limit).map(b => b.c);
  const pricesB = barsB.slice(-limit).map(b => b.c);

  // Mean
  const meanA = pricesA.reduce((sum, p) => sum + p, 0) / limit;
  const meanB = pricesB.reduce((sum, p) => sum + p, 0) / limit;

  // Covariance & Variance
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < limit; i++) {
    cov += (pricesA[i] - meanA) * (pricesB[i] - meanB);
    varB += Math.pow(pricesB[i] - meanB, 2);
  }
  cov /= limit;
  varB /= limit;

  const beta = varB > 0 ? cov / varB : 1.0;

  // Calculate spreads
  const spreads = [];
  for (let i = 0; i < limit; i++) {
    spreads.push(pricesA[i] - beta * pricesB[i]);
  }

  const meanSpread = spreads.reduce((sum, s) => sum + s, 0) / limit;
  const varianceSpread = spreads.reduce((sum, s) => sum + Math.pow(s - meanSpread, 2), 0) / limit;
  const stdSpread = Math.sqrt(varianceSpread);

  return { beta, meanSpread, stdSpread, spreads };
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

export async function scan(client, state) {
  if (state.positionsOpened >= cfg.max_positions) {
    state.log("SCAN", `At max positions (${cfg.max_positions}) — skip`);
    return;
  }

  const regime = await t(client, "regime-detect", { force_refresh: false });
  if (regime.ok) {
    state.lastRegime = regime.data.regime;
    state.log("REGIME", regime.data.regime);
    if (!cfg.allowed_regimes.includes(regime.data.regime)) {
      state.log("REGIME", `Not in allowed list (need range_bound or low_volatility) — skip`);
      state.skippedRegime++;
      return;
    }
  }

  state.log("SCAN", `Scanning ${cfg.watchlist_pairs.length} cointegrated stock pairs`);

  for (const pair of cfg.watchlist_pairs) {
    const [symbolA, symbolB] = pair;
    const pairKey = `${symbolA}-${symbolB}`;

    if (activePairs.has(pairKey) || state.traded.has(pairKey)) continue;
    if (state.positionsOpened >= cfg.max_positions) break;

    // Fetch bars for both symbols
    const barsResA = await t(client, "prices-bars", { symbol: symbolA, timeframe: "1Day", limit: cfg.lookback_days + 5 });
    const barsResB = await t(client, "prices-bars", { symbol: symbolB, timeframe: "1Day", limit: cfg.lookback_days + 5 });

    if (!barsResA.ok || !barsResB.ok || !barsResA.data.bars?.length || !barsResB.data.bars?.length) {
      state.log("SCAN", `Failed to fetch daily bars for pair ${pairKey}, skipping`);
      continue;
    }

    const metrics = calculateBetaAndSpread(barsResA.data.bars, barsResB.data.bars, cfg.lookback_days);
    if (!metrics) continue;

    const { beta, meanSpread, stdSpread } = metrics;

    // Fetch current prices
    const overResA = await t(client, "symbol-overview", { symbol: symbolA });
    const overResB = await t(client, "symbol-overview", { symbol: symbolB });
    if (!overResA.ok || !overResB.ok) continue;

    const priceA = overResA.data.latest_price;
    const priceB = overResB.data.latest_price;
    if (!priceA || !priceB) continue;

    const currentSpread = priceA - beta * priceB;
    const zScore = stdSpread > 0 ? (currentSpread - meanSpread) / stdSpread : 0;

    state.log("PAIR", `${pairKey} Beta=${beta.toFixed(3)} Z-Score=${zScore.toFixed(2)} Spread=$${currentSpread.toFixed(2)} [A=$${priceA.toFixed(2)}, B=$${priceB.toFixed(2)}]`);

    let side = null;
    if (zScore >= cfg.zscore_entry) {
      side = "short-spread"; // Short A, Long B
    } else if (zScore <= -cfg.zscore_entry) {
      side = "long-spread"; // Long A, Short B
    }

    if (!side) continue;

    const qtyA = Math.max(1, Math.floor(cfg.notional / priceA));
    const qtyB = Math.max(1, Math.floor(cfg.notional / priceB));

    state.log("SIGNAL", `${pairKey} — Z-Score ${zScore.toFixed(2)} triggers entry [${side.toUpperCase()}]`);

    // Submit aggregate signals
    await t(client, "signal-submit", {
      source: "technical", symbol: symbolA, asset_class: "equity",
      direction: side === "short-spread" ? "short" : "long", confidence: 0.85,
      urgency: "session", horizon: 120,
      rationale: `Pair trading spread arbitrage with ${symbolB}. Z-Score=${zScore.toFixed(2)}`,
    });

    await t(client, "signal-submit", {
      source: "technical", symbol: symbolB, asset_class: "equity",
      direction: side === "short-spread" ? "long" : "short", confidence: 0.85,
      urgency: "session", horizon: 120,
      rationale: `Pair trading spread arbitrage with ${symbolA}. Z-Score=${zScore.toFixed(2)}`,
    });

    // Execute order A
    const previewA = await t(client, "orders-preview", {
      symbol: symbolA, side: side === "short-spread" ? "sell" : "buy", qty: qtyA, order_type: "market", time_in_force: "day"
    });
    // Execute order B
    const previewB = await t(client, "orders-preview", {
      symbol: symbolB, side: side === "short-spread" ? "buy" : "sell", qty: qtyB, order_type: "market", time_in_force: "day"
    });

    if (!previewA.ok || !previewB.ok || !previewA.data.policy.allowed || !previewB.data.policy.allowed) {
      state.log("EXEC", `Blocked: Pair trade order preview policy check failed`);
      continue;
    }

    const submitA = await t(client, "orders-submit", { approval_token: previewA.data.policy.approval_token });
    const submitB = await t(client, "orders-submit", { approval_token: previewB.data.policy.approval_token });

    if (!submitA.ok || !submitB.ok) {
      state.log("EXEC", `Submit failed for pair legs: A=${submitA.ok}, B=${submitB.ok}`);
      continue;
    }

    state.log("EXEC", `✓ Pair Trade Entered: ${side.toUpperCase()} ${pairKey} (A=${qtyA} @ ~$${priceA.toFixed(2)}, B=${qtyB} @ ~$${priceB.toFixed(2)})`);

    state.traded.add(pairKey);
    state.positionsOpened++;
    
    const pairPosition = {
      pairKey, symbolA, symbolB, side, beta, qtyA, qtyB, entryZScore: zScore, time: new Date().toISOString()
    };
    activePairs.set(pairKey, pairPosition);
    state.fills.push(pairPosition);

    startPairMonitor(client, state, pairKey, pairPosition);
  }
  
  if (state.positionsOpened === 0) state.emptyScan++;
}

function startPairMonitor(client, state, pairKey, pairPos) {
  if (monitors.has(pairKey)) return;

  const handle = setInterval(async () => {
    try {
      const overResA = await t(client, "symbol-overview", { symbol: pairPos.symbolA });
      const overResB = await t(client, "symbol-overview", { symbol: pairPos.symbolB });
      if (!overResA.ok || !overResB.ok) return;

      const priceA = overResA.data.latest_price;
      const priceB = overResB.data.latest_price;
      if (!priceA || !priceB) return;

      // Re-fetch daily bars to calculate current spread properties
      const barsResA = await t(client, "prices-bars", { symbol: pairPos.symbolA, timeframe: "1Day", limit: cfg.lookback_days + 5 });
      const barsResB = await t(client, "prices-bars", { symbol: pairPos.symbolB, timeframe: "1Day", limit: cfg.lookback_days + 5 });
      if (!barsResA.ok || !barsResB.ok || !barsResA.data.bars?.length || !barsResB.data.bars?.length) return;

      const metrics = calculateBetaAndSpread(barsResA.data.bars, barsResB.data.bars, cfg.lookback_days);
      if (!metrics) return;

      const { beta, meanSpread, stdSpread } = metrics;
      const currentSpread = priceA - beta * priceB;
      const zScore = stdSpread > 0 ? (currentSpread - meanSpread) / stdSpread : 0;

      state.log("MONITOR", `${pairKey} Z-Score=${zScore.toFixed(2)} [Target exit: Z-Score near 0]`);

      let shouldExit = false;
      if (pairPos.side === "short-spread" && zScore <= cfg.zscore_exit) {
        shouldExit = true;
      } else if (pairPos.side === "long-spread" && zScore >= -cfg.zscore_exit) {
        shouldExit = true;
      }

      if (shouldExit) {
        state.log("EXIT", `${pairKey} Spread Mean-Reverted (Z-Score ${zScore.toFixed(2)}), Exiting...`);
        // Close both legs
        await t(client, "positions-close", { symbol: pairPos.symbolA });
        await t(client, "positions-close", { symbol: pairPos.symbolB });

        clearInterval(monitors.get(pairKey));
        monitors.delete(pairKey);
        activePairs.delete(pairKey);
      }
    } catch (err) {
      state.log("MONITOR", `${pairKey} error: ${err.message}`);
    }
  }, cfg.poll_interval_ms);

  monitors.set(pairKey, handle);

  const msToExit = msUntilET(cfg.time_exit_et.hour, cfg.time_exit_et.minute);
  setTimeout(async () => {
    if (monitors.has(pairKey)) {
      clearInterval(monitors.get(pairKey));
      monitors.delete(pairKey);
      activePairs.delete(pairKey);
      state.log("EXIT", `${pairKey} time exit`);
      await t(client, "positions-close", { symbol: pairPos.symbolA }).catch(() => {});
      await t(client, "positions-close", { symbol: pairPos.symbolB }).catch(() => {});
    }
  }, msToExit);
}

export function onStop(state) {
  for (const handle of monitors.values()) clearInterval(handle);
  monitors.clear();
  state.log("SUMMARY", `Pair trading ended. Positions opened: ${state.positionsOpened} | Empty scans: ${state.emptyScan} | Skips: ${state.skippedRegime}`);
  for (const f of state.fills) {
    state.log("FILL", `${f.pairKey} (${f.side}) entered at Z=${f.entryZScore?.toFixed(2)}`);
  }
}
