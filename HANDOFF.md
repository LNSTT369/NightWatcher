# NIGHTWATCHER V3 — SESSION HANDOFF
**Date:** 2026-05-11
**Branch:** `NIGHTWATCHER-V3`
**Session type:** Phase 3 Build — Quant Risk Framework — Complete

---

## Current Git State
```
Branch:  NIGHTWATCHER-V3
Remote:  not yet pushed
Status:  Phase 3 committed — clean working tree
Latest:  2e1eaaf feat(phase-3): quant risk framework — Kelly, Sharpe, VaR, correlation guard
```

---

## Completed Phases

### Phase 0 ✅ — Foundation
AlphaSignal interface, aggregator, WebSocket /stream, execution fill tracking, signal MCP tools.

### Phase 2 ✅ — Regime Detection Engine
ADX, ATR%, realized vol, SPY 20d return → regime classification. D1 persistence, 5-min TTL cache.

### Phase 3 ✅ — Quant Risk Framework (this session)

**Files created:**

| File | Purpose |
|------|---------|
| `src/risk/kelly.ts` | Kelly criterion: `f* = (p×b - q) / b`, capped at fraction_cap |
| `src/risk/sharpe.ts` | Rolling Sharpe: `(mean - rf) / std × √252` |
| `src/risk/var.ts` | Historical VaR + CVaR at 95%/99% confidence |
| `src/risk/correlation.ts` | Pearson correlation guard between two symbols |
| `src/storage/d1/queries/risk_metrics.ts` | Insert/retrieve all risk metric snapshots |
| `migrations/0007_risk_metrics.sql` | `risk_metric_snapshots` table |

**MCP Tools added:**
- `risk-kelly-size` — Kelly fraction from trade journal (win rate, avg win/loss pct); filters by symbol or portfolio
- `risk-sharpe` — Rolling Sharpe from trade journal pnl_pct
- `risk-var` — Historical VaR + CVaR; fetches live account equity for USD sizing
- `risk-correlation-check` — Pearson correlation via live Alpaca bar data (not sparse trade history)

**Catalog updated:** added `Risk Quant` category.

---

## Key Implementation Details

### Kelly
- Input from `trade_journal`: `pnl_pct > 0` = wins, `pnl_pct < 0` = losses
- Formula: `f* = (win_rate × b - lose_rate) / b` where `b = avg_win / avg_loss`
- Negative Kelly → 0 (no edge, don't size up)
- Default cap: 25% of equity

### Sharpe
- Uses `pnl_pct` series from `trade_journal` as "returns"
- Each trade is treated as one period; `periods_per_year = 252`
- `is_statistically_meaningful` flags n ≥ 30

### VaR
- Historical simulation (no parametric assumptions)
- `cutoffIndex = floor((1 - confidence) × n)` into sorted returns
- CVaR = mean of all returns below the VaR threshold
- USD values computed from live account equity

### Correlation
- Uses `alpaca.marketData.getBars` for daily bars (not trade history — too sparse)
- Computes `(close[t] - close[t-1]) / close[t-1] × 100` returns
- `is_over_threshold = |pearson_r| >= threshold` (default 0.7)

---

## Phase 1 — BLOCKED
Waiting on Richard Kim's firm API credentials + REST spec.

---

## Next Step — Phase 4: Smart Execution Client

Phase 4 builds the institutional execution layer that replaces the direct Alpaca pass-through.

**What it provides:**
- Abstraction over multiple execution venues (Alpaca + Richard's firm)
- Smart Order Routing (SOR): decide venue based on signal type, size, urgency
- TWAP / VWAP execution algorithms for large orders
- Dark pool routing preference for block orders (> $25k notional)
- Execution quality metrics: slippage tracking vs. mid, fill rate

**Preconditions:**
- Richard's firm REST spec / API credentials (still blocked)
- Phase 0's `AlphaSignal` + execution fill tracking is the wire-in point

**Files to create (when unblocked):**
- `src/providers/institutional/client.ts` — Richard's firm REST client
- `src/providers/institutional/types.ts` — order request/response types
- `src/execution/sor.ts` — Smart Order Router: chooses Alpaca vs. institutional
- `src/execution/algos.ts` — TWAP/VWAP slicing logic
- `src/execution/quality.ts` — slippage and fill rate tracker
- MCP tools: `execution-sor-route`, `execution-twap`, `execution-quality-report`

**In the meantime (can build now):**
- `src/execution/algos.ts` — TWAP/VWAP logic is venue-agnostic (just order slicing)
- `src/execution/quality.ts` — slippage tracking can be built against Alpaca fills now
- SOR stub that defaults to Alpaca until Richard's firm is wired in

**Start next session with:**
```
Build src/execution/algos.ts — TWAP/VWAP order slicing.
Input: total_qty, side, duration_minutes, interval_minutes.
Output: array of child orders [{qty, not_before_iso}].
No venue dependency — pure math.
```

---

## Open Questions / Blockers
- **Richard's firm API** — Phase 1 + Phase 4 execution client blocked.
- **Phase 4 SOR** — can build stub + algos now; need API spec for full routing.

---

## V3 Phase Timeline
| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Foundation: signals, WebSocket, decay, execution tracking | ✅ COMPLETE |
| 1 | Institutional data: L2, dark pool, news velocity | 🔴 BLOCKED (API access) |
| 2 | Regime engine + regime-conditional signal routing | ✅ COMPLETE |
| 3 | Quant risk: Kelly, Sharpe, VaR, correlation guard | ✅ COMPLETE |
| 4 | Smart execution: SOR, algos, dark pool routing | 🟡 PARTIALLY BUILDABLE (algos + quality now; SOR needs API) |
| 5 | Multi-asset: futures hedging, options upgrade | ⬜ Pending Phase 4 |

---

## Partnership Context
**Richard Kim** — former VP at Alpaca, now at institutional HFT clearing firm.
Processes 2-3% of US equity market volume. Direct member of 14 exchanges + all dark pools.
Building a "Master MCP layer" (Polygon SIP, Benzinga, FMP, L2/L3).
Will push real-time signals via the `/stream` WebSocket endpoint (Phase 0).
**Do not build what they already have.** They are the execution partner.

*V3 positioning: not pure HFT. Best-informed, cleanest-executing algorithmic layer a developer can build. Edge = information quality + execution discipline. See `Worked ON/V3_STANDARD_LANGUAGE.md`.*
