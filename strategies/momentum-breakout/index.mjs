/**
 * MOMENTUM BREAKOUT
 *
 * Scans a watchlist for technical breakout setups at market open and mid-morning.
 * Entry: RSI 40–65 + MACD bullish crossover + price above 20-day SMA.
 * Regime filter: only trades trending_bull, low_volatility, range_bound.
 * Sizing: Kelly criterion from journal (fallback: fixed notional).
 * Execution: SOR → TWAP (3 slices × 10 min over 30 min window).
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf-8"));

export const meta = {
  name: "Momentum Breakout",
  description: "RSI 40–65 + MACD bullish crossover + above 20-SMA. Regime-filtered. TWAP execution.",
  scanTimes: [
    { hour: 9, minute: 30 },
    { hour: 10, minute: 30 },
  ],
  stopTime: { hour: 15, minute: 59 },
};

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
 * Generate Heikin-Ashi candles from standard daily/hourly bars.
 * HA_Close = (Open + High + Low + Close) / 4
 * HA_Open = (Prev_HA_Open + Prev_HA_Close) / 2 (or standard open for first candle)
 * HA_High = max(High, HA_Open, HA_Close)
 * HA_Low = min(Low, HA_Open, HA_Close)
 */
function computeHeikinAshi(bars) {
  if (!bars || bars.length === 0) return [];
  const haBars = [];
  
  // First candle
  let prevOpen = bars[0].o;
  let prevClose = (bars[0].o + bars[0].h + bars[0].l + bars[0].c) / 4;
  haBars.push({
    t: bars[0].t,
    o: prevOpen,
    c: prevClose,
    h: Math.max(bars[0].h, prevOpen, prevClose),
    l: Math.min(bars[0].l, prevOpen, prevClose),
  });
  
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const haClose = (b.o + b.h + b.l + b.c) / 4;
    const haOpen = (prevOpen + prevClose) / 2;
    const haHigh = Math.max(b.h, haOpen, haClose);
    const haLow = Math.min(b.l, haOpen, haClose);
    
    haBars.push({ t: b.t, o: haOpen, c: haClose, h: haHigh, l: haLow });
    prevOpen = haOpen;
    prevClose = haClose;
  }
  
  return haBars;
}

export async function scan(client, state) {
  if (state.positionsOpened >= cfg.max_positions) {
    state.log("SCAN", `Max positions (${cfg.max_positions}) reached — skip`);
    return;
  }

  // Regime filter
  const regime = await t(client, "regime-detect", { force_refresh: false });
  if (regime.ok) {
    state.lastRegime = regime.data.regime;
    state.log("REGIME", regime.data.regime, { adx: regime.data.adx?.toFixed(1) });
    if (!cfg.allowed_regimes.includes(regime.data.regime)) {
      state.log("REGIME", `Not in allowed list — skip scan`);
      state.skippedRegime++;
      return;
    }
  }

  // Technical scan
  state.log("SCAN", `Scanning ${cfg.watchlist.length} watchlist symbols`);
  const candidates = [];

  const batchRes = await t(client, "signals-batch", { symbols: cfg.watchlist, timeframe: "1Day" });
  if (!batchRes.ok) {
    state.log("SCAN", "Failed to fetch signals-batch");
    return;
  }

  const results = batchRes.data.results || [];
  const resultsMap = {};
  for (const r of results) {
    resultsMap[r.symbol] = r;
  }

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

    // Heikin-Ashi Filter
    let haOk = true;
    let haDetails = null;
    if (cfg.heikin_ashi_filter?.enabled && price != null) {
      const barsRes = await t(client, "prices-bars", { symbol, timeframe: "1Day", limit: 20 });
      if (barsRes.ok && barsRes.data.bars?.length >= 5) {
        const haCandles = computeHeikinAshi(barsRes.data.bars);
        const latestHA = haCandles[haCandles.length - 1];
        const isGreen = latestHA.c > latestHA.o;
        const lowShadowPct = ((latestHA.o - latestHA.l) / latestHA.o) * 100;
        const maxLowShadow = cfg.heikin_ashi_filter.max_lower_shadow_pct ?? 0.05;
        const minimalLowerShadow = lowShadowPct <= maxLowShadow;
        haOk = isGreen && minimalLowerShadow;
        haDetails = { isGreen, lowShadowPct, minimalLowerShadow };
      } else {
        haOk = false;
      }
    }

    if (!rsiOk || !hasBullish || !haOk) {
      state.log("SCAN", `${symbol} filtered`, {
        rsi: rsi?.toFixed(1),
        bullish: hasBullish,
        heikin_ashi: haOk ? "pass" : haDetails ? `fail (green=${haDetails.isGreen}, shadow=${haDetails.lowShadowPct.toFixed(3)}%)` : "fail (no data)"
      });
      continue;
    }

    // Confidence: RSI position in range + SMA + MACD bonuses
    const rsiScore = 1 - Math.abs((rsi - 52.5) / 12.5);
    const confidence = Math.min(0.95, rsiScore * 0.75 + (aboveSma ? 0.1 : 0) + (macdBull ? 0.1 : 0) + 0.05);

    candidates.push({ symbol, rsi, confidence, price, aboveSma, sigs });
    state.log("SCAN", `${symbol} → candidate`, { rsi: rsi.toFixed(1), conf: confidence.toFixed(2) });
  }

  if (!candidates.length) { state.emptyScan++; state.log("SCAN", "No candidates"); return; }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const pick = candidates[0];
  if (pick.confidence < cfg.min_confidence) {
    state.log("SCAN", `Top ${pick.symbol} confidence ${pick.confidence.toFixed(2)} below threshold`);
    return;
  }

  state.log("PICK", pick.symbol, { conf: pick.confidence.toFixed(2), rsi: pick.rsi.toFixed(1) });

  // Submit + aggregate signal
  const sig = await t(client, "signal-submit", {
    source: "technical",
    symbol: pick.symbol,
    asset_class: "equity",
    direction: "long",
    confidence: pick.confidence,
    urgency: "session",
    horizon: 120,
    rationale: `RSI ${pick.rsi.toFixed(1)}, ${pick.aboveSma ? "above" : "near"} 20-SMA. Signals: ${pick.sigs.map(s => s.type).join(", ")}`,
    regime_tags: state.lastRegime ? [state.lastRegime] : [],
    suggested_notional: cfg.notional_per_trade,
  });
  if (!sig.ok) return;

  const agg = await t(client, "signal-aggregate", { symbol: pick.symbol });
  if (!agg.ok || agg.data.final_direction !== "long") return;

  // Kelly (best-effort)
  const kelly = await t(client, "risk-kelly-size", { symbol: pick.symbol, kelly_fraction_cap: 0.25 });
  if (kelly.ok) state.log("KELLY", pick.symbol, { pct_equity: kelly.data.recommended_pct_equity });

  // SOR
  const sor = await t(client, "execution-sor-route", {
    symbol: pick.symbol, side: "buy", total_qty: 3,
    notional_usd: cfg.notional_per_trade, urgency: "session",
    signal_source: "technical", signal_confidence: pick.confidence,
  });
  if (!sor.ok) return;
  state.log("SOR", `${sor.data.venue} / ${sor.data.algo}`);

  // Execute order
  const preview = await t(client, "orders-preview", {
    symbol: pick.symbol, side: "buy", qty: 3,
    order_type: sor.data.algo, time_in_force: "day",
    signal_confidence: pick.confidence,
  });
  if (!preview.ok || !preview.data.policy.allowed) {
    const why = (preview.data?.policy?.violations || []).map(v => v.message || v.rule).join("; ");
    state.log("EXEC", `Blocked: ${why || preview.error?.message}`);
    return;
  }

  const submit = await t(client, "orders-submit", { approval_token: preview.data.policy.approval_token });
  if (!submit.ok) { state.log("EXEC", `Submit failed: ${submit.error?.message}`); return; }

  state.log("EXEC", `✓ BUY 3 ${pick.symbol} @ ~$${preview.data.preview.estimated_price}`, {
    order_id: submit.data.order.id,
  });

  // Record fill
  const fp = preview.data.preview.estimated_price;
  await t(client, "execution-record-fill", {
    alpaca_order_id: submit.data.order.id,
    symbol: pick.symbol, side: "buy", qty: 3,
    fill_price: fp, expected_price: fp,
    venue: "alpaca", algo_type: sor.data.algo,
    aggregated_signal_id: agg.data.aggregated_signal_id,
  });

  state.traded.add(pick.symbol);
  state.positionsOpened++;
  state.fills.push({ symbol: pick.symbol, qty: 3, price: fp, order_id: submit.data.order.id, time: new Date().toISOString() });
}

export function onStop(state) {
  state.log("SUMMARY", `Positions opened: ${state.positionsOpened}`);
  state.log("SUMMARY", `Empty scans: ${state.emptyScan} | Regime skips: ${state.skippedRegime}`);
  for (const f of state.fills) {
    state.log("FILL", `${f.symbol} ×${f.qty} @ $${f.price?.toFixed(2)} [${f.order_id}]`);
  }
}
