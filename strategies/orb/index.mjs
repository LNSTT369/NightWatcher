/**
 * ORB — Opening Range Breakout
 *
 * Rule:
 *   1. First 1-hour candle of NY session (9:30–10:30 ET) defines the range.
 *   2. Enter on breakout above ORB high (long) or below ORB low (short).
 *   3. VWAP confirmation required: long only if price > VWAP, short only if price < VWAP.
 *   4. 1:2 R:R — stop at the opposite side of the ORB range, target = 2× risk.
 *   5. Time exit at 3:00 PM ET if stop/target not hit.
 *   6. One trade per day.
 *
 * Execution: market order on breakout confirmation (urgency = immediate → SOR returns market).
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf-8"));

export const meta = {
  name: "ORB — Opening Range Breakout",
  description: "1h ORB + VWAP confirmation. 1:2 R:R. Time exit 3 PM ET. One trade/day.",
  // scan() is called at 10:30 AM once the ORB is fully formed.
  // scan() then sets up 5-min polling internally.
  scanTimes: [{ hour: 10, minute: 30 }],
  stopTime: { hour: 15, minute: 59 },
};

async function t(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse(res.content[0].text);
}

// Compute VWAP from intraday bars: Σ(tp × vol) / Σ(vol), tp = (h+l+c)/3
function computeVwap(bars) {
  let pv = 0, vol = 0;
  for (const b of bars) {
    const tp = (b.h + b.l + b.c) / 3;
    pv += tp * b.v;
    vol += b.v;
  }
  return vol > 0 ? pv / vol : null;
}

// ET offset: UTC-4 (EDT, Mar–Nov), UTC-5 (EST) otherwise
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

export async function scan(client, state) {
  if (state.tradeTaken) {
    state.log("ORB", "Trade already taken today — skip");
    return;
  }

  // ── Step 1: Capture the ORB (first 1h candle) ───────────────────────────
  state.log("ORB", `Fetching 1h bars for ${cfg.symbol} to define opening range`);
  const barsRes = await t(client, "prices-bars", {
    symbol: cfg.symbol,
    timeframe: "1Hour",
    limit: 3, // grab a few in case the current bar is still forming
  });

  if (!barsRes.ok || !barsRes.data.bars?.length) {
    state.log("ORB", "Failed to fetch 1h bars — abort");
    return;
  }

  // The ORB is the most recently completed 1h bar (second-to-last if market just opened)
  const bars1h = barsRes.data.bars;
  const orbBar = bars1h[bars1h.length - 2] ?? bars1h[bars1h.length - 1];

  const orb = {
    high: orbBar.h,
    low: orbBar.l,
    range: orbBar.h - orbBar.l,
    open: orbBar.o,
    close: orbBar.c,
    time: orbBar.t,
  };

  state.log("ORB", `Range defined`, {
    high: orb.high.toFixed(2),
    low: orb.low.toFixed(2),
    range: orb.range.toFixed(2),
    time: orb.time,
  });

  if (orb.range <= 0) {
    state.log("ORB", "Zero-width range — skip");
    return;
  }

  state.orb = orb;

  // ── Step 2: Start polling for breakout + VWAP confirmation ───────────────
  state.log("ORB", `Polling every ${cfg.poll_interval_ms / 60_000} min for breakout`);

  const pollHandle = setInterval(async () => {
    if (state.tradeTaken) {
      // Monitor stop/target while in trade
      await monitorPosition(client, state);
      return;
    }

    try {
      await checkBreakout(client, state);
    } catch (err) {
      state.log("ORB", `Poll error: ${err.message}`);
    }
  }, cfg.poll_interval_ms);

  // Schedule time exit at 3:00 PM ET (close any open position)
  const msToExit = msUntilET(cfg.time_exit_et.hour, cfg.time_exit_et.minute);
  state.log("ORB", `Time exit scheduled in ${(msToExit / 3_600_000).toFixed(2)}h`);
  setTimeout(async () => {
    clearInterval(pollHandle);
    state.log("ORB", "3:00 PM ET — time exit");
    await timeExit(client, state);
  }, msToExit);

  // Store handle so onStop can clear it
  state.pollHandle = pollHandle;
}

async function checkBreakout(client, state) {
  const { orb } = state;

  // Fetch current intraday 5-min bars for VWAP
  const intrRes = await t(client, "prices-bars", {
    symbol: cfg.symbol,
    timeframe: "5Min",
    limit: 79, // full session from 9:30 to 3:35 (max ~79 bars)
  });

  if (!intrRes.ok) return;

  const bars5m = intrRes.data.bars;
  const vwap = computeVwap(bars5m);
  const price = bars5m[bars5m.length - 1]?.c;

  if (!price || !vwap) return;

  const buffer = orb.range * (cfg.breakout_buffer_pct / 100);
  const longBreak = price > orb.high + buffer;
  const shortBreak = price < orb.low - buffer;
  const longVwap = vwap != null && price > vwap;
  const shortVwap = vwap != null && price < vwap;

  state.log("ORB", `Price $${price.toFixed(2)}  VWAP $${vwap?.toFixed(2)}  ORB ${orb.low.toFixed(2)}–${orb.high.toFixed(2)}`, {
    long_break: longBreak,
    short_break: shortBreak,
  });

  if (longBreak && longVwap) {
    await enterTrade(client, state, "buy", price, vwap);
  } else if (shortBreak && shortVwap) {
    await enterTrade(client, state, "sell", price, vwap);
  }
}

async function enterTrade(client, state, side, price, vwap) {
  const { orb } = state;
  const qty = Math.max(1, Math.floor(cfg.notional / price));

  // R:R levels
  // Long: stop = ORB low, target = entry + 2 × (entry - ORB low)
  // Short: stop = ORB high, target = entry - 2 × (ORB high - entry)
  const risk = side === "buy"
    ? price - orb.low
    : orb.high - price;
  const stopPrice = side === "buy" ? orb.low : orb.high;
  const targetPrice = side === "buy"
    ? price + cfg.rr_ratio * risk
    : price - cfg.rr_ratio * risk;

  state.log("ORB", `${side.toUpperCase()} signal confirmed`, {
    entry: price.toFixed(2),
    stop: stopPrice.toFixed(2),
    target: targetPrice.toFixed(2),
    risk_usd: (risk * qty).toFixed(2),
    reward_usd: (risk * qty * cfg.rr_ratio).toFixed(2),
    vwap: vwap.toFixed(2),
  });

  // SOR — immediate urgency → market order
  const sor = await t(client, "execution-sor-route", {
    symbol: cfg.symbol, side, total_qty: qty,
    notional_usd: cfg.notional, urgency: "immediate",
    signal_source: "technical",
  });
  state.log("SOR", `${sor.data?.venue} / ${sor.data?.algo}`);

  // Submit signal for audit trail
  await t(client, "signal-submit", {
    source: "technical",
    symbol: cfg.symbol,
    asset_class: "equity",
    direction: side === "buy" ? "long" : "short",
    confidence: 0.78,
    urgency: "immediate",
    horizon: 300,
    rationale: `ORB breakout ${side === "buy" ? "above" : "below"} range. VWAP $${vwap.toFixed(2)}. Entry $${price.toFixed(2)}, stop $${stopPrice.toFixed(2)}, target $${targetPrice.toFixed(2)}.`,
  });

  const preview = await t(client, "orders-preview", {
    symbol: cfg.symbol, side, qty,
    order_type: "market", time_in_force: "day",
  });

  if (!preview.ok || !preview.data.policy.allowed) {
    const why = (preview.data?.policy?.violations || []).map(v => v.message || v.rule).join("; ");
    state.log("EXEC", `Blocked: ${why || preview.error?.message}`);
    return;
  }

  const submit = await t(client, "orders-submit", { approval_token: preview.data.policy.approval_token });
  if (!submit.ok) { state.log("EXEC", `Submit failed: ${submit.error?.message}`); return; }

  const fillPrice = preview.data.preview.estimated_price ?? price;
  state.log("EXEC", `✓ ${side.toUpperCase()} ${qty} ${cfg.symbol} @ ~$${fillPrice.toFixed(2)}`, {
    order_id: submit.data.order.id,
  });

  await t(client, "execution-record-fill", {
    alpaca_order_id: submit.data.order.id,
    symbol: cfg.symbol, side, qty,
    fill_price: fillPrice, expected_price: price,
    venue: "alpaca", algo_type: "market",
  });

  state.tradeTaken = true;
  state.trade = { side, qty, entry: fillPrice, stop: stopPrice, target: targetPrice, order_id: submit.data.order.id };
  state.fills.push({ symbol: cfg.symbol, side, qty, price: fillPrice, order_id: submit.data.order.id, time: new Date().toISOString() });
}

async function monitorPosition(client, state) {
  if (!state.trade) return;

  const { side, qty, stop, target } = state.trade;

  const overview = await t(client, "symbol-overview", { symbol: cfg.symbol });
  if (!overview.ok) return;

  const price = overview.data.latest_price;
  state.log("MONITOR", `${cfg.symbol} $${price.toFixed(2)}  stop=$${stop.toFixed(2)}  target=$${target.toFixed(2)}`);

  const hitTarget = side === "buy" ? price >= target : price <= target;
  const hitStop = side === "buy" ? price <= stop : price >= stop;

  if (hitTarget) {
    state.log("EXIT", `Target hit @ $${price.toFixed(2)}`);
    await closePosition(client, state, "target");
  } else if (hitStop) {
    state.log("EXIT", `Stop hit @ $${price.toFixed(2)}`);
    await closePosition(client, state, "stop");
  }
}

async function closePosition(client, state, reason) {
  const res = await t(client, "positions-close", { symbol: cfg.symbol });
  if (res.ok) {
    state.log("EXIT", `Position closed (${reason})`, { order_id: res.data.order?.id });
    state.exitReason = reason;
  } else {
    state.log("EXIT", `Close failed: ${res.error?.message}`);
  }
  if (state.pollHandle) clearInterval(state.pollHandle);
}

async function timeExit(client, state) {
  if (!state.tradeTaken) { state.log("ORB", "No trade taken — nothing to exit"); return; }
  state.log("EXIT", "Time exit — closing position at 3:00 PM ET");
  await closePosition(client, state, "time_exit");
}

export function onStop(state) {
  if (state.pollHandle) clearInterval(state.pollHandle);
  state.log("SUMMARY", state.tradeTaken
    ? `Trade: ${state.trade?.side} ${state.trade?.qty} ${cfg.symbol} @ $${state.trade?.entry?.toFixed(2)} | Exit: ${state.exitReason ?? "open"}`
    : "No trade taken today"
  );
  if (state.orb) {
    state.log("SUMMARY", `ORB range: $${state.orb.low.toFixed(2)}–$${state.orb.high.toFixed(2)} (${state.orb.range.toFixed(2)} pts)`);
  }
}
