/**
 * AWESOME OSCILLATOR
 *
 * Scans for momentum breakout setups using the Awesome Oscillator (AO).
 * AO = SMA(Median Price, 5) - SMA(Median Price, 34).
 * Triggers:
 *  1. Zero Line Crossover (AO crosses above 0).
 *  2. Saucer Buy (AO above 0, two consecutive red histograms followed by a green).
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf-8"));

export const meta = {
  name: "Awesome Oscillator",
  description: "Awesome Oscillator saucer and zero crossovers. Trending regimes.",
  scanTimes: [
    { hour: 9, minute: 45 },
    { hour: 11, minute: 0 },
    { hour: 13, minute: 0 },
  ],
  stopTime: { hour: 15, minute: 59 },
};

const openPositions = new Map();
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

function computeAwesomeOscillator(bars, fastPeriod = 5, slowPeriod = 34) {
  if (!bars || bars.length < slowPeriod) return null;
  
  const medians = bars.map(b => (b.h + b.l) / 2);
  const ao = [];
  
  for (let i = slowPeriod - 1; i < bars.length; i++) {
    const fastSlice = medians.slice(i - fastPeriod + 1, i + 1);
    const slowSlice = medians.slice(i - slowPeriod + 1, i + 1);
    
    const fastSMA = fastSlice.reduce((a, b) => a + b, 0) / fastPeriod;
    const slowSMA = slowSlice.reduce((a, b) => a + b, 0) / slowPeriod;
    
    ao.push({
      t: bars[i].t,
      val: fastSMA - slowSMA,
      close: bars[i].c,
      high: bars[i].h,
      low: bars[i].l,
    });
  }
  
  return ao;
}

function detectAOSignals(ao) {
  if (!ao || ao.length < 4) return { buy: false, reason: "" };

  const N = ao.length - 1;
  const current = ao[N].val;
  const prev1 = ao[N - 1].val;
  const prev2 = ao[N - 2].val;
  const prev3 = ao[N - 3].val;

  // 1. Zero Line Crossover
  const isZeroCrossover = prev1 < 0 && current > 0;
  if (isZeroCrossover) {
    return { buy: true, reason: "Zero Line Crossover (crossed above 0)" };
  }

  // 2. Saucer Buy
  // AO above 0, two consecutive red histograms (decreasing), followed by green (increasing)
  const allAboveZero = current > 0 && prev1 > 0 && prev2 > 0 && prev3 > 0;
  const isSaucer = allAboveZero &&
                   current > prev1 &&   // green today
                   prev1 < prev2 &&     // red yesterday
                   prev2 < prev3;       // red day before
  if (isSaucer) {
    return { buy: true, reason: "Saucer Buy Pattern (above 0, red-red-green)" };
  }

  return { buy: false, reason: "" };
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
      state.log("REGIME", `Not in allowed list (need trending_bull or low_volatility) — skip`);
      state.skippedRegime++;
      return;
    }
  }

  state.log("SCAN", `Scanning ${cfg.watchlist.length} symbols for Awesome Oscillator setups`);

  for (const symbol of cfg.watchlist) {
    if (openPositions.has(symbol) || state.traded.has(symbol)) continue;
    if (state.positionsOpened >= cfg.max_positions) break;

    const barsRes = await t(client, "prices-bars", { symbol, timeframe: "1Day", limit: cfg.slow_period + 10 });
    if (!barsRes.ok || !barsRes.data.bars?.length) {
      state.log("SCAN", `${symbol} — failed to fetch daily bars, skip`);
      continue;
    }

    const ao = computeAwesomeOscillator(barsRes.data.bars, cfg.fast_period, cfg.slow_period);
    if (!ao) continue;

    const signal = detectAOSignals(ao);
    if (!signal.buy) continue;

    // Fetch current price
    const overview = await t(client, "symbol-overview", { symbol });
    if (!overview.ok) continue;
    const price = overview.data.latest_price;
    if (!price) continue;

    state.log("SIGNAL", `${symbol} — Awesome Oscillator buy signal triggered: ${signal.reason}`);

    const qty = Math.max(1, Math.floor(cfg.notional_per_trade / price));

    // Dynamic stop loss: 2.0 * daily ATR or rolling low of last 3 bars
    const atrRes = await t(client, "prices-bars", { symbol, timeframe: "1Day", limit: 22 });
    let stopPrice = price * 0.95; // default 5%
    if (atrRes.ok && atrRes.data.bars?.length >= 5) {
      const last3 = atrRes.data.bars.slice(-3);
      const lowestLow = Math.min(...last3.map(b => b.l));
      stopPrice = Math.min(price * 0.97, lowestLow); // Protect at lowest low or 3%
    }
    const targetPrice = price + (price - stopPrice) * 2.0; // 2R reward target

    const preview = await t(client, "orders-preview", {
      symbol, side: "buy", qty, order_type: "market", time_in_force: "day"
    });

    if (!preview.ok || !preview.data.policy.allowed) {
      state.log("EXEC", `Blocked: Awesome Oscillator order preview failed policy checks`);
      continue;
    }

    const submit = await t(client, "orders-submit", { approval_token: preview.data.policy.approval_token });
    if (!submit.ok) {
      state.log("EXEC", `Submit failed: ${submit.error?.message}`);
      continue;
    }

    state.log("EXEC", `✓ BUY ${qty} ${symbol} @ ~$${price.toFixed(2)} [AO=${ao[ao.length - 1].val.toFixed(4)}, stop=$${stopPrice.toFixed(2)}, target=$${targetPrice.toFixed(2)}]`);

    state.traded.add(symbol);
    state.positionsOpened++;
    
    const fill = { symbol, qty, price, stop: stopPrice, target: targetPrice, reason: signal.reason, time: new Date().toISOString() };
    openPositions.set(symbol, fill);
    state.fills.push(fill);

    startAOMonitor(client, state, symbol, fill);
  }

  if (state.positionsOpened === 0) state.emptyScan++;
}

function startAOMonitor(client, state, symbol, position) {
  if (monitors.has(symbol)) return;

  const handle = setInterval(async () => {
    try {
      const overview = await t(client, "symbol-overview", { symbol });
      if (!overview.ok) return;
      const price = overview.data.latest_price;
      if (!price) return;

      state.log("MONITOR", `${symbol} $${price.toFixed(2)} stop=$${position.stop.toFixed(2)} target=$${position.target.toFixed(2)}`);

      if (price >= position.target) {
        state.log("EXIT", `${symbol} target hit @ $${price.toFixed(2)}`);
        await t(client, "positions-close", { symbol });
        clearInterval(monitors.get(symbol));
        monitors.delete(symbol);
        openPositions.delete(symbol);
      } else if (price <= position.stop) {
        state.log("EXIT", `${symbol} stop hit @ $${price.toFixed(2)}`);
        await t(client, "positions-close", { symbol });
        clearInterval(monitors.get(symbol));
        monitors.delete(symbol);
        openPositions.delete(symbol);
      }
    } catch (err) {
      state.log("MONITOR", `${symbol} error: ${err.message}`);
    }
  }, cfg.poll_interval_ms);

  monitors.set(symbol, handle);

  const msToExit = msUntilET(cfg.time_exit_et.hour, cfg.time_exit_et.minute);
  setTimeout(async () => {
    if (monitors.has(symbol)) {
      clearInterval(monitors.get(symbol));
      monitors.delete(symbol);
      openPositions.delete(symbol);
      state.log("EXIT", `${symbol} time exit`);
      await t(client, "positions-close", { symbol }).catch(() => {});
    }
  }, msToExit);
}

export function onStop(state) {
  for (const handle of monitors.values()) clearInterval(handle);
  monitors.clear();
  state.log("SUMMARY", `Awesome Oscillator ended. Positions opened: ${state.positionsOpened} | Empty scans: ${state.emptyScan} | Skips: ${state.skippedRegime}`);
  for (const f of state.fills) {
    state.log("FILL", `${f.symbol} ×${f.qty} @ $${f.price?.toFixed(2)} triggered by: ${f.reason}`);
  }
}
