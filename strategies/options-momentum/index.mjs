/**
 * OPTIONS MOMENTUM — IVP & Strike Optimizer (Phase 4)
 *
 * Scans for high-momentum breakouts and buys optimized Calls for leveraged exposure.
 *
 * Implements quantitative upgrades:
 *   1. Implied Volatility Percentile (IVP < 30% check) using 20-day realized volatility 
 *      over a 252-day lookback to avoid IV crush.
 *   2. Dynamic DTE Selection (targeting 30 days) and dynamic Strike Selection 
 *      targeting the 50–60 delta near-the-money sweet-spot.
 *   3. Dynamic Vega/Theta-optimized exits (Delta < 0.20 or DTE <= 3) alongside 
 *      standard +100% TP and -50% SL boundaries.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf-8"));

export const meta = {
  name: "Options Momentum",
  description: "Momentum breakout → Dynamic OTM/NTM calls with IVP filter and Vega/Theta exit gates.",
  scanTimes: [
    { hour: 9, minute: 30 },
    { hour: 10, minute: 30 },
  ],
  stopTime: { hour: 15, minute: 30 },
};

const monitors = new Map();
const openPositions = new Map();

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
  const month = now.getUTCMonth() + 1;
  const offsetMin = (month >= 3 && month <= 11) ? 240 : 300;
  const etNow = new Date(now.getTime() - offsetMin * 60_000);
  const target = new Date(etNow);
  target.setUTCHours(hour, minute, 0, 0);
  let targetUTC = new Date(target.getTime() + offsetMin * 60_000);
  if (targetUTC <= now) targetUTC = new Date(targetUTC.getTime() + 86_400_000);
  return targetUTC.getTime() - now.getTime();
}

function getDTE(expirationDate) {
  const expiry = new Date(expirationDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ── Volatility and IVP proxy calculations ─────────────────────────────────────

function calculateStdDev(returns) {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  return Math.sqrt(variance);
}

function calculateIVPercentileFromBars(bars, symbol, state) {
  if (!bars || bars.length < 50) {
    state.log("IVP", `${symbol} — Insufficient bar history, default to 15% IVP`);
    return 0.15;
  }
  
  const returns = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].c;
    const curr = bars[i].c;
    if (prev > 0) returns.push((curr - prev) / prev);
  }

  const rvs = [];
  const volPeriod = 20;
  for (let i = volPeriod; i <= returns.length; i++) {
    const windowReturns = returns.slice(i - volPeriod, i);
    const rv = calculateStdDev(windowReturns);
    rvs.push(rv);
  }

  if (rvs.length === 0) return 0.15;

  const currentRV = rvs[rvs.length - 1];
  const countBelow = rvs.filter(v => v < currentRV).length;
  const percentile = countBelow / rvs.length;

  return percentile;
}

// ── Main scan logic ───────────────────────────────────────────────────────────

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
      state.log("REGIME", "Not in allowed list — skip");
      state.skippedRegime++;
      return;
    }
  }

  state.log("SCAN", `Scanning ${cfg.watchlist.length} watchlist symbols for options momentum`);

  // 1. Fetch 280 bars for entire watchlist in a single batch call
  const barsRes = await t(client, "prices-bars-batch", { symbols: cfg.watchlist, timeframe: "1Day", limit: 280 });
  if (!barsRes.ok) {
    state.log("SCAN", "Failed to fetch batch prices-bars for IVP");
    return;
  }
  const barsMap = barsRes.data.bars || {};

  // 2. Fetch technical signals in batch
  const batchRes = await t(client, "signals-batch", { symbols: cfg.watchlist, timeframe: "1Day" });
  if (!batchRes.ok) {
    state.log("SCAN", "Failed to fetch batch signals");
    return;
  }
  const results = batchRes.data.results || [];
  const resultsMap = {};
  for (const r of results) {
    resultsMap[r.symbol] = r;
  }

  const candidates = [];

  for (const symbol of cfg.watchlist) {
    if (state.traded.has(symbol)) continue;

    const res = resultsMap[symbol];
    if (!res) continue;

    const tech = res.technicals;
    const sigs = res.signals;
    const rsi = tech?.rsi_14;
    const price = tech?.price;
    const sma20 = tech?.sma_20;
    const macdHist = tech?.macd?.histogram;

    const rsiOk = rsi != null && rsi >= cfg.rsi_min && rsi <= cfg.rsi_max;
    const aboveSma = sma20 != null && price != null && price > sma20;
    const macdBull = macdHist != null && macdHist > 0;
    const hasBullish = sigs?.some(s => s.direction === "bullish");

    if (!rsiOk || !hasBullish) continue;

    const rsiScore = 1 - Math.abs((rsi - 55) / 10);
    const confidence = Math.min(0.95, rsiScore * 0.75 + (aboveSma ? 0.1 : 0) + (macdBull ? 0.1 : 0) + 0.05);

    if (confidence < cfg.min_confidence) {
      state.log("SCAN", `${symbol} confidence ${confidence.toFixed(2)} below threshold ${cfg.min_confidence}`);
      continue;
    }

    candidates.push({ symbol, rsi, confidence, price, aboveSma, macdBull });
    state.log("CANDIDATE", `${symbol} conf=${confidence.toFixed(2)} rsi=${rsi.toFixed(1)}`);
  }

  if (!candidates.length) { state.emptyScan++; state.log("SCAN", "No candidates"); return; }

  // Sort by confidence, take the top candidate
  candidates.sort((a, b) => b.confidence - a.confidence);
  
  for (const pick of candidates) {
    if (state.positionsOpened >= cfg.max_positions) break;

    // IVP Check - entirely in-memory using pre-fetched barsMap!
    const ivpBars = barsMap[pick.symbol];
    const ivp = calculateIVPercentileFromBars(ivpBars, pick.symbol, state);
    state.log("IVP", `${pick.symbol} Volatility Percentile: ${(ivp * 100).toFixed(1)}%`);
    if (ivp >= 0.30) {
      state.log("IVP", `${pick.symbol} Volatility Percentile ${(ivp * 100).toFixed(1)}% >= 30% (high IV crush risk) — skip symbol`);
      continue;
    }

    state.log("PICK", `${pick.symbol} selected with conf=${pick.confidence.toFixed(2)} and cheap IVP=${(ivp * 100).toFixed(1)}%`);

    // Fetch expirations using "underlying" argument
    const expRes = await t(client, "options-expirations", { underlying: pick.symbol });
    if (!expRes.ok || !expRes.data?.expirations?.length) {
      state.log("OPTIONS", `No expirations found for ${pick.symbol} — skip`);
      continue;
    }

    // Filter expirations by DTE
    const expirations = expRes.data.expirations;
    let filteredExpirations = expirations.filter(exp => {
      const dte = getDTE(exp);
      return dte >= cfg.min_dte && dte <= cfg.max_dte;
    });

    if (filteredExpirations.length === 0) {
      state.log("OPTIONS", `No expirations in range ${cfg.min_dte}-${cfg.max_dte} for ${pick.symbol} — falling back to first active expiration`);
      filteredExpirations = [expirations[0]];
    }

    // Select the expiration closest to 30 days DTE
    const selectedExpiration = filteredExpirations.sort((a, b) => {
      return Math.abs(getDTE(a) - 30) - Math.abs(getDTE(b) - 30);
    })[0];

    state.log("OPTIONS", `${pick.symbol} selected expiration ${selectedExpiration} (DTE: ${getDTE(selectedExpiration)})`);

    // Fetch chain for expiration
    const chainRes = await t(client, "options-chain", { underlying: pick.symbol, expiration: selectedExpiration });
    if (!chainRes.ok || !chainRes.data?.calls?.length) {
      state.log("OPTIONS", `Failed to get calls chain for ${pick.symbol} @ ${selectedExpiration} — skip`);
      continue;
    }

    // Pick 5 Call contracts closest to current stock price
    const calls = chainRes.data.calls;
    const sortedByStrike = calls.sort((a, b) => Math.abs(a.strike - pick.price) - Math.abs(b.strike - pick.price));
    const targetContracts = sortedByStrike.slice(0, 5);

    // Fetch Greeks and quotes in parallel to locate delta in [0.50, 0.60]
    const snapshotPromises = targetContracts.map(async (c) => {
      try {
        const snap = await t(client, "options-snapshot", { contract_symbol: c.symbol });
        if (snap.ok && snap.data) {
          return {
            contract: c,
            delta: snap.data.greeks?.delta ?? (c.strike < pick.price ? 0.60 : 0.40),
            ask: snap.data.latest_quote?.ask_price || 1.5, // sensible mock price if closed
            bid: snap.data.latest_quote?.bid_price || 1.4,
            iv: snap.data.implied_volatility || 0.3
          };
        }
      } catch {
        return null;
      }
      return null;
    });

    const snapshots = (await Promise.all(snapshotPromises)).filter(s => s !== null && s.ask > 0);
    if (snapshots.length === 0) {
      state.log("OPTIONS", `Failed to fetch snapshots for options contracts of ${pick.symbol} — skip`);
      continue;
    }

    // Sort by proximity to delta = 0.55
    const optimalSnapshot = snapshots.sort((a, b) => Math.abs(a.delta - 0.55) - Math.abs(b.delta - 0.55))[0];
    if (!optimalSnapshot) {
      state.log("OPTIONS", `Failed to optimize strike delta for ${pick.symbol} — skip`);
      continue;
    }

    const contract = optimalSnapshot.contract;
    const askPrice = optimalSnapshot.ask;
    const optionDelta = optimalSnapshot.delta;

    state.log("OPTIONS", `${pick.symbol} optimized Call: ${contract.symbol} | Strike: $${contract.strike} | Delta: ${optionDelta.toFixed(2)} | Ask: $${askPrice.toFixed(2)}`);

    // Sizing
    const contractCost = askPrice * 100;
    const qty = Math.max(1, Math.floor(cfg.notional_per_trade / contractCost));
    const premium = contractCost * qty;

    await t(client, "signal-submit", {
      source: "technical", symbol: pick.symbol, asset_class: "option",
      direction: "long", confidence: pick.confidence,
      urgency: "session", horizon: cfg.max_dte * 24 * 60,
      rationale: `Options momentum. IVP ${(ivp*100).toFixed(1)}%. Call ${contract.symbol} delta ${optionDelta.toFixed(2)} closest to 0.55.`,
      regime_tags: state.lastRegime ? [state.lastRegime] : [],
      suggested_notional: cfg.notional_per_trade,
    });

    const preview = await t(client, "options-order-preview", {
      contract_symbol: contract.symbol,
      side: "buy",
      qty,
      order_type: "limit",
      limit_price: askPrice,
      time_in_force: "day",
    });

    if (!preview.ok || !preview.data?.policy?.allowed) {
      const violations = (preview.data?.policy?.violations || []).map(v => v.message || v.rule).join("; ");
      const why = violations || preview.error?.message || "policy blocked";
      state.log("EXEC", `Options blocked: ${why}`);
      continue;
    }

    const submit = await t(client, "options-order-submit", { approval_token: preview.data.policy.approval_token });
    if (!submit.ok) { state.log("EXEC", `Submit failed: ${submit.error?.message}`); continue; }

    state.log("EXEC", `✓ BUY ${qty} × ${contract.symbol} @ $${askPrice.toFixed(2)} ($${premium.toFixed(0)} premium)`);

    state.traded.add(pick.symbol);
    state.positionsOpened++;
    state.fills.push({ symbol: pick.symbol, contract: contract.symbol, qty, premium, order_id: submit.data.order?.id, time: new Date().toISOString() });

    // Begin active position monitor
    startMonitor(client, state, contract.symbol, pick.symbol, askPrice, qty);
    break; // trade one pick per scan cycle
  }
}

// ── Options position monitor and exit engine ──────────────────────────────────

function startMonitor(client, state, contractSymbol, underlying, entryPrice, qty) {
  if (monitors.has(contractSymbol)) return;

  const handle = setInterval(async () => {
    try {
      const snap = await t(client, "options-snapshot", { contract_symbol: contractSymbol });
      if (!snap.ok || !snap.data) return;

      const bidPrice = snap.data.latest_quote?.bid_price || 0;
      if (bidPrice === 0) return; // skip if closed/no bid

      const delta = snap.data.greeks?.delta ?? 0.50;

      // Extract expiration date to compute DTE dynamically
      const contractParts = contractSymbol.match(/[A-Z]+(\d{6})[CP]\d+/);
      let dte = 30;
      if (contractParts && contractParts[1]) {
        const dateStr = "20" + contractParts[1].substring(0, 2) + "-" + contractParts[1].substring(2, 4) + "-" + contractParts[1].substring(4, 6);
        const expiry = new Date(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dte = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      state.log("MONITOR", `${contractSymbol} bid=$${bidPrice.toFixed(2)} delta=${delta.toFixed(2)} dte=${dte}`);

      // Exit rules:
      // 1. Take Profit (+100%)
      if (bidPrice >= entryPrice * (1 + cfg.take_profit_pct / 100)) {
        state.log("EXIT", `${contractSymbol} target hit (+${cfg.take_profit_pct}%) @ bid=$${bidPrice.toFixed(2)}`);
        await closeOption(client, state, contractSymbol);
      }
      // 2. Stop Loss (-50%)
      else if (bidPrice <= entryPrice * (1 - cfg.stop_loss_pct / 100)) {
        state.log("EXIT", `${contractSymbol} stop hit (-${cfg.stop_loss_pct}%) @ bid=$${bidPrice.toFixed(2)}`);
        await closeOption(client, state, contractSymbol);
      }
      // 3. Dynamic Delta Cut-Loss (delta < 0.20)
      else if (delta < 0.20) {
        state.log("EXIT", `${contractSymbol} delta decay cut (delta=${delta.toFixed(2)} < 0.20) @ bid=$${bidPrice.toFixed(2)}`);
        await closeOption(client, state, contractSymbol);
      }
      // 4. Dynamic Theta Time-Cut (DTE <= 3)
      else if (dte <= 3) {
        state.log("EXIT", `${contractSymbol} Theta decay time cut (dte=${dte} <= 3) @ bid=$${bidPrice.toFixed(2)}`);
        await closeOption(client, state, contractSymbol);
      }

    } catch (err) {
      state.log("MONITOR", `${contractSymbol} monitor error: ${err.message}`);
    }
  }, cfg.poll_interval_ms || 300000); // default 5 minutes

  monitors.set(contractSymbol, handle);

  const msToExit = msUntilET(15, 55);
  setTimeout(async () => {
    if (monitors.has(contractSymbol)) {
      clearInterval(monitors.get(contractSymbol));
      monitors.delete(contractSymbol);
      state.log("EXIT", `${contractSymbol} session time exit`);
      await closeOption(client, state, contractSymbol).catch(() => {});
    }
  }, msToExit);
}

async function closeOption(client, state, contractSymbol) {
  const res = await t(client, "positions-close", { symbol: contractSymbol });
  if (res.ok) {
    state.log("EXIT", `✓ Closed option position ${contractSymbol}`);
    openPositions.delete(contractSymbol);
    if (monitors.has(contractSymbol)) {
      clearInterval(monitors.get(contractSymbol));
      monitors.delete(contractSymbol);
    }
  } else {
    state.log("EXIT", `Option close failed: ${res.error?.message}`);
  }
}

export function onStop(state) {
  for (const handle of monitors.values()) clearInterval(handle);
  monitors.clear();
  openPositions.clear();
  state.log("SUMMARY", `Options positions opened: ${state.positionsOpened}`);
  for (const f of state.fills) {
    state.log("FILL", `${f.symbol} → ${f.contract} ×${f.qty} premium=$${f.premium?.toFixed(0)}`);
  }
}
