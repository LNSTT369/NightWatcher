/**
 * ORB — Opening Range Breakout (multi-asset, long-only)
 *
 * Backtested spec (MNQ 60m, May 2022–May 2026):
 *   Long-only  — short-side Sharpe -1.49 on 60m timeframe, structurally unprofitable.
 *   2.5R target — identical 55.98% win rate from 1R to 3R; 2.5R maximises expectancy (8.82 pts).
 *   Noon cutoff — signals only valid before 12:00 PM ET (avoids mid-day doldrums).
 *   60-min range — higher Sharpe (1.48) vs 15-min; filters fake-out trades.
 *
 * Flow:
 *   1. scan() at 10:30 AM — captures the completed 9:30–10:30 ORB for all watchlist symbols.
 *   2. 5-min poll — checks each untraded symbol for a close above range high + buffer.
 *      Entries blocked after 12:00 PM ET.
 *   3. Per-position monitor — polls stop and 2.5R target; closes on first hit.
 *   4. Force-close — any open position is liquidated at 3:55 PM ET (session end).
 *
 * Watchlist rule — 10 fixed assets chosen for:
 *   (a) top-tier liquidity (>$1B avg daily dollar volume),
 *   (b) avg daily range >1% of price (room for breakouts to run),
 *   (c) strong trend-following intraday behaviour.
 *   10 symbols × ~2 MCP calls each = ~20 calls/poll cycle — well inside Alpaca free-tier limits.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf-8"));

export const meta = {
  name: "ORB — Opening Range Breakout",
  description: "60m ORB, long-only, 2.5R target, noon cutoff. 10-asset curated universe.",
  scanTimes: [{ hour: 10, minute: 30 }],
  stopTime: { hour: 15, minute: 59 },
};

// symbol → { high, low, range } captured at scan time
const orbRanges = new Map();

// symbol → { qty, entry, stop, target, order_id }
const openPositions = new Map();

let pollHandle = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function t(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse(res.content[0].text);
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

function isBeforeEntryCutoff() {
  const now = new Date();
  const offsetMin = (now.getUTCMonth() + 1) >= 3 && (now.getUTCMonth() + 1) <= 11 ? 240 : 300;
  const etNow = new Date(now.getTime() - offsetMin * 60_000);
  const etHour = etNow.getUTCHours();
  const etMin = etNow.getUTCMinutes();
  return etHour < cfg.entry_cutoff_et.hour ||
    (etHour === cfg.entry_cutoff_et.hour && etMin < cfg.entry_cutoff_et.minute);
}

// ── Step 1: capture ORB ranges ────────────────────────────────────────────────

async function captureRanges(client, state) {
  state.log("ORB", `Capturing 60m opening ranges for: ${cfg.watchlist.join(", ")}`);

  for (const symbol of cfg.watchlist) {
    const res = await t(client, "prices-bars", {
      symbol,
      timeframe: cfg.orb_timeframe,
      limit: 3,
    });

    if (!res.ok || !res.data.bars?.length) {
      state.log("ORB", `${symbol} — failed to fetch bars, skipping`);
      continue;
    }

    // The ORB is the most recently completed 1h bar (the 9:30–10:30 candle)
    const bars = res.data.bars;
    const orbBar = bars[bars.length - 2] ?? bars[bars.length - 1];

    const orb = {
      high: orbBar.h,
      low:  orbBar.l,
      range: orbBar.h - orbBar.l,
      time: orbBar.t,
    };

    if (orb.range <= 0) {
      state.log("ORB", `${symbol} — zero-width range, skipping`);
      continue;
    }

    orbRanges.set(symbol, orb);
    state.log("ORB", `${symbol} range defined`, {
      high: orb.high.toFixed(2),
      low:  orb.low.toFixed(2),
      range: orb.range.toFixed(2),
    });
  }
}

// ── Step 2: poll for breakouts ────────────────────────────────────────────────

async function checkBreakouts(client, state) {
  const entryOpen = isBeforeEntryCutoff();

  for (const symbol of cfg.watchlist) {
    // Already in this position
    if (openPositions.has(symbol)) continue;

    // Already traded today
    if (state.traded.has(symbol)) continue;

    // At max positions
    if (openPositions.size >= cfg.max_positions) break;

    // No range captured
    const orb = orbRanges.get(symbol);
    if (!orb) continue;

    // Fetch current price
    const overview = await t(client, "symbol-overview", { symbol });
    if (!overview.ok) continue;
    const price = overview.data.latest_price;
    if (!price) continue;

    const buffer = orb.range * (cfg.breakout_buffer_pct / 100);
    const longBreak = price > orb.high + buffer;

    if (!longBreak) continue;

    // Entry cutoff: long signals blocked after noon
    if (!entryOpen) {
      state.log("ORB", `${symbol} breakout confirmed but past noon cutoff — skip`);
      continue;
    }

    state.log("ORB", `${symbol} LONG breakout confirmed @ $${price.toFixed(2)}`, {
      orb_high: orb.high.toFixed(2),
      buffer:   buffer.toFixed(2),
    });

    await enterLong(client, state, symbol, price, orb);
  }
}

// ── Step 3: enter long ────────────────────────────────────────────────────────

async function enterLong(client, state, symbol, price, orb) {
  const qty = Math.max(1, Math.floor(cfg.notional / price));

  // Stop = ORB low. Target = entry + 2.5 × (entry - ORB low).
  const risk        = price - orb.low;
  const stopPrice   = orb.low;
  const targetPrice = price + cfg.rr_ratio * risk;

  state.log("ORB", `${symbol} sizing`, {
    qty,
    entry:  price.toFixed(2),
    stop:   stopPrice.toFixed(2),
    target: targetPrice.toFixed(2),
    risk_usd: (risk * qty).toFixed(2),
    reward_usd: (risk * qty * cfg.rr_ratio).toFixed(2),
  });

  await t(client, "signal-submit", {
    source: "technical", symbol, asset_class: "equity",
    direction: "long", confidence: 0.80,
    urgency: "immediate", horizon: 180,
    rationale: `ORB long breakout above $${orb.high.toFixed(2)}. Entry $${price.toFixed(2)}, stop $${stopPrice.toFixed(2)}, target $${targetPrice.toFixed(2)} (2.5R).`,
  });

  await t(client, "execution-sor-route", {
    symbol, side: "buy", total_qty: qty,
    notional_usd: cfg.notional, urgency: "immediate",
    signal_source: "technical",
  });

  const preview = await t(client, "orders-preview", {
    symbol, side: "buy", qty,
    order_type: "market", time_in_force: "day",
  });

  if (!preview.ok || !preview.data.policy.allowed) {
    const why = (preview.data?.policy?.violations || []).map(v => v.message || v.rule).join("; ");
    state.log("EXEC", `${symbol} blocked: ${why || preview.error?.message}`);
    return;
  }

  const submit = await t(client, "orders-submit", { approval_token: preview.data.policy.approval_token });
  if (!submit.ok) { state.log("EXEC", `${symbol} submit failed: ${submit.error?.message}`); return; }

  const fillPrice = preview.data.preview.estimated_price ?? price;
  state.log("EXEC", `✓ BUY ${qty} ${symbol} @ ~$${fillPrice.toFixed(2)}`, {
    stop:   stopPrice.toFixed(2),
    target: targetPrice.toFixed(2),
    order_id: submit.data.order.id,
  });

  await t(client, "execution-record-fill", {
    alpaca_order_id: submit.data.order.id,
    symbol, side: "buy", qty,
    fill_price: fillPrice, expected_price: price,
    venue: "alpaca", algo_type: "market",
  });

  openPositions.set(symbol, { qty, entry: fillPrice, stop: stopPrice, target: targetPrice, order_id: submit.data.order.id });
  state.traded.add(symbol);
  state.positionsOpened++;
  state.fills.push({ symbol, qty, price: fillPrice, stop: stopPrice, target: targetPrice, order_id: submit.data.order.id, time: new Date().toISOString() });
}

// ── Step 4: monitor open positions ────────────────────────────────────────────

async function monitorPositions(client, state) {
  for (const [symbol, pos] of openPositions) {
    const overview = await t(client, "symbol-overview", { symbol });
    if (!overview.ok) continue;
    const price = overview.data.latest_price;

    state.log("MONITOR", `${symbol} $${price.toFixed(2)}  stop=$${pos.stop.toFixed(2)}  target=$${pos.target.toFixed(2)}`);

    if (price >= pos.target) {
      state.log("EXIT", `${symbol} target (2.5R) hit @ $${price.toFixed(2)}`);
      await closePosition(client, state, symbol, "target");
    } else if (price <= pos.stop) {
      state.log("EXIT", `${symbol} stop hit @ $${price.toFixed(2)}`);
      await closePosition(client, state, symbol, "stop");
    }
  }
}

async function closePosition(client, state, symbol, reason) {
  const res = await t(client, "positions-close", { symbol });
  if (res.ok) {
    state.log("EXIT", `${symbol} closed (${reason})`, { order_id: res.data.order?.id });
  } else {
    state.log("EXIT", `${symbol} close failed: ${res.error?.message}`);
  }
  openPositions.delete(symbol);
}

// ── Main scan entrypoint ──────────────────────────────────────────────────────

export async function scan(client, state) {
  // 1. Capture ORB ranges for all watchlist symbols
  await captureRanges(client, state);

  // If all ranges failed, bail
  if (orbRanges.size === 0) {
    state.log("ORB", "No ranges captured — abort");
    return;
  }

  // 2. Already polling from a prior scan call (shouldn't happen with one scanTime, but guard it)
  if (pollHandle) return;

  state.log("ORB", `Polling every ${cfg.poll_interval_ms / 60_000} min. Entry window closes at ${cfg.entry_cutoff_et.hour}:00 ET. Force-exit at ${cfg.time_exit_et.hour}:${String(cfg.time_exit_et.minute).padStart(2,'0')} ET.`);

  // Run an immediate first check
  await checkBreakouts(client, state);

  // 3. Start poll loop: check breakouts (if before noon) + monitor positions
  pollHandle = setInterval(async () => {
    try {
      await checkBreakouts(client, state);
      await monitorPositions(client, state);
    } catch (err) {
      state.log("ORB", `Poll error: ${err.message}`);
    }
  }, cfg.poll_interval_ms);

  // 4. Force-close everything at session end
  const msToExit = msUntilET(cfg.time_exit_et.hour, cfg.time_exit_et.minute);
  setTimeout(async () => {
    clearInterval(pollHandle);
    pollHandle = null;
    for (const symbol of openPositions.keys()) {
      state.log("EXIT", `${symbol} force-close at session end`);
      await closePosition(client, state, symbol, "session_end").catch(() => {});
    }
  }, msToExit);
}

export function onStop(state) {
  if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
  orbRanges.clear();
  openPositions.clear();

  state.log("SUMMARY", `Positions opened: ${state.positionsOpened}`);
  for (const f of state.fills) {
    state.log("FILL", `${f.symbol} ×${f.qty} @ $${f.price?.toFixed(2)}  stop=$${f.stop?.toFixed(2)}  target=$${f.target?.toFixed(2)}`);
  }
}
