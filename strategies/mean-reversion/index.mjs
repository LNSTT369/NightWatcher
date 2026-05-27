/**
 * MEAN REVERSION (SMA-20 Bollinger Proxy)
 *
 * Scans for stocks trading >= sma_deviation_pct% below their 20-day SMA
 * with RSI in oversold territory. Enters long and targets a full reversion
 * to the SMA. Only operates in range_bound and high_volatility regimes.
 *
 * Target: 20-day SMA. Stop: entry × (1 - sma_deviation_pct%).
 * Polls every 5 min after entry. Time exit: 3:30 PM ET.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf-8"));

export const meta = {
  name: "Mean Reversion",
  description: "SMA-20 deviation + RSI oversold. Range/vol regimes only.",
  scanTimes: [
    { hour: 10, minute: 30 },
    { hour: 12, minute: 0 },
    { hour: 13, minute: 30 },
  ],
  stopTime: { hour: 15, minute: 59 },
};

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

/**
 * Detect a Bollinger Bands W-Bottom (Double Bottom) Pattern.
 * 1. Find local minima (low points) in the last 20 daily bars.
 * 2. L1: price breaches the lower band (close <= SMA20 - 2 * StdDev).
 * 3. L2: price forms a higher low, remaining inside/above the lower band (L2 > L1).
 * Returns { detected: boolean, l1: object, l2: object, diffDays: number }
 */
function detectWBottomPattern(bars) {
  if (!bars || bars.length < 15) return { detected: false };
  
  const closes = bars.map(b => b.c);
  const lows = bars.map(b => b.l);
  
  // Find local minima
  const localMinima = [];
  for (let i = 1; i < bars.length - 1; i++) {
    if (lows[i] <= lows[i - 1] && lows[i] <= lows[i + 1]) {
      const slice = closes.slice(Math.max(0, i - 19), i + 1);
      if (slice.length >= 5) {
        const sum = slice.reduce((a, b) => a + b, 0);
        const mean = sum / slice.length;
        const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length;
        const stdDev = Math.sqrt(variance);
        const lowerBand = mean - 2 * stdDev;
        localMinima.push({ index: i, price: lows[i], lowerBand, close: closes[i] });
      }
    }
  }
  
  if (localMinima.length < 2) return { detected: false };
  
  for (let idx1 = 0; idx1 < localMinima.length - 1; idx1++) {
    const l1 = localMinima[idx1];
    if (l1.price > l1.lowerBand * 1.01) continue; // L1 must touch or breach the lower band
    
    for (let idx2 = idx1 + 1; idx2 < localMinima.length; idx2++) {
      const l2 = localMinima[idx2];
      const diffDays = l2.index - l1.index;
      if (diffDays >= 2 && diffDays <= 15) {
        const isHigherLow = l2.price > l1.price;
        const staysAboveBand = l2.price >= l2.lowerBand * 0.99;
        
        if (isHigherLow && staysAboveBand) {
          return { detected: true, l1, l2, diffDays };
        }
      }
    }
  }
  
  return { detected: false };
}

function calculateVolIndicators(bars, currentPrice) {
  if (!bars || bars.length < 20) return null;
  
  // 1. Rolling Z-Score
  const closes = bars.slice(-20).map(b => b.c);
  const sum = closes.reduce((a, b) => a + b, 0);
  const mean = sum / closes.length;
  const variance = closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / closes.length;
  const stdDev = Math.sqrt(variance);
  const zScore = stdDev > 0 ? (currentPrice - mean) / stdDev : 0;
  
  // 2. Average True Range (ATR)
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h;
    const l = bars[i].l;
    const cp = bars[i - 1].c;
    const tr = Math.max(h - l, Math.abs(h - cp), Math.abs(l - cp));
    trs.push(tr);
  }
  const atr = trs.slice(-14).reduce((a, b) => a + b, 0) / 14;

  return { zScore, mean, stdDev, atr };
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
      state.log("REGIME", "Not in allowed list (need range_bound or high_volatility) — skip");
      state.skippedRegime++;
      return;
    }
  }

  state.log("SCAN", `Scanning ${cfg.watchlist.length} watchlist symbols`);

  // 1. Fetch historical bars in batch
  const barsRes = await t(client, "prices-bars-batch", { symbols: cfg.watchlist, timeframe: "1Day", limit: 35 });
  if (!barsRes.ok) {
    state.log("SCAN", "Failed to fetch batch prices-bars");
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

  for (const symbol of cfg.watchlist) {
    if (state.traded.has(symbol)) continue;
    if (state.positionsOpened >= cfg.max_positions) break;

    const bars = barsMap[symbol];
    if (!bars || !bars.length) continue;

    const res = resultsMap[symbol];
    if (!res) continue;

    const tech = res.technicals;
    const price = tech?.price;
    const rsi = tech?.rsi_14;

    if (!price) continue;

    const volInds = calculateVolIndicators(bars, price);
    if (!volInds) continue;

    const { zScore, mean: sma20, stdDev, atr } = volInds;
    const belowSma = zScore <= -2.0;
    const rsiOk = rsi != null && rsi < cfg.rsi_oversold;

    // Bollinger W-Bottom Pattern Filter
    let wBottomOk = true;
    let wBottomDetails = null;
    if (cfg.bollinger_pattern_filter?.enabled) {
      const wRes = detectWBottomPattern(bars);
      wBottomOk = wRes.detected;
      wBottomDetails = wRes;
    }

    state.log("MR", `${symbol} price=$${price.toFixed(2)} sma20=$${sma20.toFixed(2)} zScore=${zScore.toFixed(2)} stdDev=$${stdDev.toFixed(2)} atr=$${atr.toFixed(2)}`, {
      rsi: rsi?.toFixed(1),
      w_bottom: wBottomOk ? "pass" : "fail",
    });

    if (!belowSma || !rsiOk || !wBottomOk) continue;

    state.log("SIGNAL", `${symbol} — Z-Score ${zScore.toFixed(2)} <= -2.0, RSI ${rsi.toFixed(1)}, W-Bottom Confirmed (L1=$${wBottomDetails.l1.price.toFixed(2)}, L2=$${wBottomDetails.l2.price.toFixed(2)}, separated by ${wBottomDetails.diffDays} days)`);

    const qty = Math.max(1, Math.floor(cfg.notional_per_trade / price));
    // Dynamic stop-loss: 1.5 * ATR below entry price
    const stopPrice = price - 1.5 * atr;
    const targetPrice = sma20;

    await t(client, "signal-submit", {
      source: "technical", symbol, asset_class: "equity",
      direction: "long", confidence: 0.70,
      urgency: "session", horizon: 90,
      rationale: `Mean reversion. Z-Score ${zScore.toFixed(2)} <= -2.0. RSI ${rsi.toFixed(1)}. Dynamic ATR stop $${stopPrice.toFixed(2)}.`,
      regime_tags: state.lastRegime ? [state.lastRegime] : [],
      suggested_notional: cfg.notional_per_trade,
    });

    const preview = await t(client, "orders-preview", {
      symbol, side: "buy", qty, order_type: "market", time_in_force: "day",
    });

    if (!preview.ok || !preview.data.policy.allowed) {
      const why = (preview.data?.policy?.violations || []).map(v => v.message || v.rule).join("; ");
      state.log("EXEC", `Blocked: ${why || preview.error?.message}`);
      continue;
    }

    const submit = await t(client, "orders-submit", { approval_token: preview.data.policy.approval_token });
    if (!submit.ok) { state.log("EXEC", `Submit failed: ${submit.error?.message}`); continue; }

    const fillPrice = preview.data.preview.estimated_price ?? price;
    state.log("EXEC", `✓ BUY ${qty} ${symbol} @ ~$${fillPrice.toFixed(2)}`, {
      stop: stopPrice.toFixed(2), target: targetPrice.toFixed(2),
    });

    await t(client, "execution-record-fill", {
      alpaca_order_id: submit.data.order.id,
      symbol, side: "buy", qty,
      fill_price: fillPrice, expected_price: price,
      venue: "alpaca", algo_type: "market",
    });

    state.traded.add(symbol);
    state.positionsOpened++;
    state.fills.push({ symbol, qty, price: fillPrice, stop: stopPrice, target: targetPrice, order_id: submit.data.order.id, time: new Date().toISOString() });

    startMonitor(client, state, symbol, fillPrice, stopPrice, targetPrice);
  }

  if (state.positionsOpened === 0) state.emptyScan++;
}

function startMonitor(client, state, symbol, entry, stop, target) {
  if (monitors.has(symbol)) return;

  const handle = setInterval(async () => {
    try {
      const overview = await t(client, "symbol-overview", { symbol });
      if (!overview.ok) return;
      const price = overview.data.latest_price;
      state.log("MONITOR", `${symbol} $${price.toFixed(2)} stop=$${stop.toFixed(2)} target=$${target.toFixed(2)}`);

      if (price >= target) {
        state.log("EXIT", `${symbol} target (SMA20) hit @ $${price.toFixed(2)}`);
        await t(client, "positions-close", { symbol });
        clearInterval(monitors.get(symbol));
        monitors.delete(symbol);
      } else if (price <= stop) {
        state.log("EXIT", `${symbol} stop hit @ $${price.toFixed(2)}`);
        await t(client, "positions-close", { symbol });
        clearInterval(monitors.get(symbol));
        monitors.delete(symbol);
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
      state.log("EXIT", `${symbol} time exit`);
      await t(client, "positions-close", { symbol }).catch(() => {});
    }
  }, msToExit);
}

export function onStop(state) {
  for (const handle of monitors.values()) clearInterval(handle);
  monitors.clear();
  state.log("SUMMARY", `Positions opened: ${state.positionsOpened} | Empty scans: ${state.emptyScan} | Regime skips: ${state.skippedRegime}`);
  for (const f of state.fills) {
    state.log("FILL", `${f.symbol} ×${f.qty} @ $${f.price?.toFixed(2)}`);
  }
}
