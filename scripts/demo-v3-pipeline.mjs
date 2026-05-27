#!/usr/bin/env node
/**
 * NIGHTWATCHER V3 — Full Pipeline Demo
 *
 * Demonstrates the complete algorithmic flow:
 *   signal-submit → signal-aggregate → regime-detect → risk-kelly-size
 *   → execution-sor-route → execution-twap → orders-preview → orders-submit (paper)
 *   → execution-record-fill → execution-slippage-calc
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const MCP_URL = "http://localhost:8787/mcp";
const SYMBOL = "AAPL";
const NOTIONAL_USD = 500; // ~3 shares at ~$170 — small enough to demo safely

function hr(label) {
  console.log(`\n${"─".repeat(60)}`);
  if (label) console.log(`  ${label}`);
  console.log("─".repeat(60));
}

function ok(label, data) {
  console.log(`✓  ${label}`);
  if (data !== undefined) console.log("   →", JSON.stringify(data, null, 2).split("\n").join("\n   "));
}

function skip(label, reason) {
  console.log(`⚠  ${label}: ${reason}`);
}

async function tool(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content[0].text;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Tool "${name}" returned non-JSON: ${text}`);
  }
}

async function main() {
  hr("NIGHTWATCHER V3 — Pipeline Demo");
  console.log(`  Symbol:  ${SYMBOL}`);
  console.log(`  Venue:   Alpaca paper`);
  console.log(`  Time:    ${new Date().toISOString()}`);

  // ── Connect ──────────────────────────────────────────────────────────────
  hr("0. Connect");
  const transport = new SSEClientTransport(new URL(MCP_URL));
  const client = new Client({ name: "v3-demo", version: "1.0" }, { capabilities: {} });
  await client.connect(transport);
  ok("Connected to MCP server", MCP_URL);

  const verify = await tool(client, "auth-verify");
  if (!verify.ok) throw new Error("Auth failed: " + JSON.stringify(verify.error));
  ok("Alpaca auth verified", {
    paper: verify.data.paper,
    account_number: verify.data.account_number,
  });

  // ── Step 1: Submit signal ────────────────────────────────────────────────
  hr("1. Submit Alpha Signal");
  const sig = await tool(client, "signal-submit", {
    source: "technical",
    symbol: SYMBOL,
    asset_class: "equity",
    direction: "long",
    confidence: 0.72,
    urgency: "session",
    horizon: 120,
    rationale: `${SYMBOL} breakout above 20-day high on above-average volume; RSI 58 (non-overbought); MACD bullish crossover confirmed.`,
    regime_tags: ["trending_bull"],
    suggested_notional: NOTIONAL_USD,
  });
  if (!sig.ok) throw new Error("signal-submit failed: " + JSON.stringify(sig.error));
  ok("Signal submitted", {
    signal_id: sig.data.signal_id,
    direction: sig.data.direction,
    confidence: sig.data.confidence,
  });

  // ── Step 2: Aggregate signals ────────────────────────────────────────────
  hr("2. Aggregate Signals");
  const agg = await tool(client, "signal-aggregate", { symbol: SYMBOL });
  if (!agg.ok) throw new Error("signal-aggregate failed");
  ok("Signals aggregated", {
    final_direction: agg.data.final_direction,
    final_confidence: agg.data.final_confidence,
    conflict_detected: agg.data.conflict_detected,
    source_count: agg.data.source_count,
  });

  if (agg.data.final_direction !== "long" || agg.data.final_confidence < 0.5) {
    skip("Signal gate", "Low confidence or conflicting signals — aborting");
    process.exit(0);
  }

  // ── Step 3: Regime detection ─────────────────────────────────────────────
  hr("3. Market Regime Detection");
  const regime = await tool(client, "regime-detect", { force_refresh: false });
  if (!regime.ok) {
    skip("Regime detect", regime.error?.message ?? "failed");
  } else {
    ok("Regime detected", {
      regime: regime.data.regime,
      adx: regime.data.adx,
      realized_vol_pct: regime.data.realized_vol_pct,
      cached: regime.data.cached,
    });
  }

  // ── Step 4: Kelly position sizing ────────────────────────────────────────
  hr("4. Kelly Position Sizing");
  const kelly = await tool(client, "risk-kelly-size", {
    symbol: SYMBOL,
    kelly_fraction_cap: 0.25,
    lookback_trades: 100,
  });
  let kellyPct = 10; // fallback if no journal history
  if (!kelly.ok) {
    skip("Kelly sizing", "No trade journal history yet — using 10% equity default");
  } else {
    kellyPct = kelly.data.recommended_pct_equity;
    ok("Kelly sizing", {
      kelly_fraction: kelly.data.kelly_fraction,
      recommended_pct_equity: kelly.data.recommended_pct_equity,
      is_positive_edge: kelly.data.is_positive_edge,
      n_trades: kelly.data.n_trades,
    });
  }

  // ── Step 5: Correlation guard ─────────────────────────────────────────────
  hr("5. Correlation Guard (vs SPY)");
  const corr = await tool(client, "risk-correlation-check", {
    symbol_a: SYMBOL,
    symbol_b: "SPY",
    lookback_days: 60,
    threshold: 0.85,
  });
  if (!corr.ok) {
    skip("Correlation check", corr.error?.message ?? "failed");
  } else {
    ok("Correlation checked", {
      pearson_r: corr.data.pearson_r,
      is_over_threshold: corr.data.is_over_threshold,
      n: corr.data.n,
    });
    if (corr.data.is_over_threshold) {
      console.log(`   ⚠  ${SYMBOL}/SPY correlation ${corr.data.pearson_r.toFixed(3)} > 0.85 — concentration risk noted`);
    }
  }

  // ── Step 6: SOR routing ──────────────────────────────────────────────────
  hr("6. Smart Order Router");
  const sor = await tool(client, "execution-sor-route", {
    symbol: SYMBOL,
    side: "buy",
    total_qty: 3,
    notional_usd: NOTIONAL_USD,
    urgency: "session",
    signal_source: "technical",
    signal_confidence: agg.data.final_confidence,
  });
  if (!sor.ok) throw new Error("SOR failed");
  ok("SOR decision", {
    venue: sor.data.venue,
    algo: sor.data.algo,
    rationale: sor.data.rationale,
  });

  // ── Step 7: Order Preview ──────────────────────────────────────────────────
  hr("7. Order Policy Gate Preview");
  console.log(`   Previewing: BUY 3 ${SYMBOL} via ${sor.data.algo.toUpperCase()} order`);

  const preview = await tool(client, "orders-preview", {
    symbol: SYMBOL,
    side: "buy",
    qty: 3,
    order_type: sor.data.algo,
    time_in_force: "day",
    signal_confidence: agg.data.final_confidence,
  });

  if (!preview.ok) {
    skip("Preview", preview.error?.message ?? "failed");
    process.exit(0);
  }

  if (!preview.data.policy.allowed) {
    const violations = (preview.data.policy.violations || []).map(v => v.message || v.rule).join("; ");
    skip("Policy gate", violations);
    process.exit(0);
  }

  ok("Policy approved", {
    estimated_price: preview.data.preview.estimated_price,
    estimated_cost: preview.data.preview.estimated_cost,
    expires_at: preview.data.policy.expires_at,
  });

  // ── Step 8: Order Submission ─────────────────────────────────────────────
  hr("8. Order Submission");
  const submit = await tool(client, "orders-submit", {
    approval_token: preview.data.policy.approval_token,
  });

  if (!submit.ok) {
    skip("Submit", submit.error?.message ?? "failed");
    process.exit(0);
  }
  ok("ORDER SUBMITTED (paper)", {
    order_id: submit.data.order.id,
    symbol: submit.data.order.symbol,
    status: submit.data.order.status,
  });

  // ── Step 9: Record fill + slippage quality ────────────────────────────────
  hr("9. Fill Quality Analysis");
  const fillPrice = preview.data.preview.estimated_price;
  const expectedPrice = preview.data.preview.estimated_price;

  const fill = await tool(client, "execution-record-fill", {
    alpaca_order_id: submit.data.order.id,
    symbol: SYMBOL,
    side: "buy",
    qty: 3,
    ...(fillPrice > 0 && { fill_price: fillPrice }),
    ...(expectedPrice > 0 && { expected_price: expectedPrice }),
    venue: "alpaca",
    algo_type: sor.data.algo,
    dark_pool_pct: 0,
    aggregated_signal_id: agg.data.aggregated_signal_id,
  });
  if (!fill.ok) {
    skip("Record fill", fill.error?.message ?? "failed");
  } else {
    ok("Fill recorded", { fill_id: fill.data.fill_id });
  }

  const quality = await tool(client, "execution-slippage-calc", {
    side: "buy",
    fill_price: fillPrice > 0 ? fillPrice : 0,
    ...(expectedPrice > 0 && { expected_price: expectedPrice }),
  });
  if (!quality.ok) {
    skip("Slippage calc", "failed");
  } else {
    ok("Slippage analysis", {
      slippage_vs_expected_bps: quality.data.slippage_vs_expected_bps,
      fill_grade: quality.data.fill_grade,
      is_favorable: quality.data.is_favorable,
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  hr("PIPELINE COMPLETE");
  console.log(`  ${SYMBOL}  BUY 3 shares @ ~$${fillPrice?.toFixed(2)} using ${sor.data.algo.toUpperCase()}`);
  console.log();

  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ PIPELINE ERROR:", err.message);
  process.exit(1);
});
