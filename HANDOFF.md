# NIGHTWATCHER V3 — SESSION HANDOFF
**Date:** 2026-05-11
**Branch:** `NIGHTWATCHER-V3`
**Session type:** Phase 4a Build — Smart Execution Layer — Complete

---

## Current Git State
```
Branch:  NIGHTWATCHER-V3
Remote:  not yet pushed
Status:  Phase 4a committed — clean working tree
Latest:  839c010 feat(phase-4a): smart execution layer — TWAP, VWAP, SOR, slippage calc
```

---

## Completed Phases

### Phase 0 ✅ — Foundation
AlphaSignal interface, aggregator, WebSocket /stream, execution fill tracking, signal MCP tools.

### Phase 2 ✅ — Regime Detection Engine
ADX, ATR%, realized vol, SPY 20d return → regime classification. D1 persistence, 5-min TTL cache.

### Phase 3 ✅ — Quant Risk Framework
Kelly, Sharpe, VaR, Pearson correlation guard. 4 MCP tools. `risk_metric_snapshots` D1 table.

### Phase 4a ✅ — Smart Execution Layer (this session)

**Files created:**

| File | Purpose |
|------|---------|
| `src/execution/algos.ts` | TWAP/VWAP order slicing — pure math, no venue dependency |
| `src/execution/quality.ts` | Slippage metrics: vs. expected, vs. VWAP, implementation shortfall, fill grade |
| `src/execution/sor.ts` | Smart Order Router stub — venue + algo selection |

**MCP Tools added:**
- `execution-twap` — generate TWAP child order schedule `[{qty, not_before_iso}]`
- `execution-vwap` — generate VWAP-weighted schedule using standard U-shaped intraday curve
- `execution-sor-route` — SOR: given symbol/size/urgency, returns venue + algo + suggested params
- `execution-slippage-calc` — compute slippage bps vs. expected/VWAP/decision price + fill grade

**Catalog updated:** added `Execution Algos` category.

---

## Key Implementation Details

### TWAP (`buildTwapSchedule`)
- `n = floor(duration_minutes / interval_minutes)` slices
- Equal baseQty = `floor(total_qty / n)`, remainder goes to last slice
- `not_before_iso[i] = start + i × interval_minutes`

### VWAP (`buildVwapSchedule`)
- 13 30-min ET buckets, U-shaped: 16% open, 5% midday, 10% close
- Raw weights for each slot → normalize → integer-share allocation via rounding
- Last slice = `total_qty - sum(all previous rounded slices)` to avoid drift
- DST approximation: UTC-4 for months 3–11, UTC-5 otherwise

### Quality (`calcSlippageMetrics`)
- Positive bps = unfavorable for direction (paid more on buy, received less on sell)
- Grade: excellent ≤5 bps | good ≤15 | fair ≤50 | poor >50
- Graded by best available benchmark: VWAP > expected > decision price

### SOR (`routeOrder`)
- Dark pool eligible: notional ≥ $25k
- Block order: notional ≥ $100k → `requires_institutional = true` (flags when to prefer Richard's firm)
- Immediate → market | large + session/swing → VWAP | swing + small → TWAP | default → market
- `requires_institutional` is the forward-compatibility hook for Phase 1 wire-in

---

## Phase 1 — BLOCKED
Waiting on Richard Kim's firm API credentials + REST spec.

---

## Phase 4b — Remaining (after Phase 1 unblocks)

When Richard's firm API arrives:
1. `src/providers/institutional/client.ts` — REST client
2. `src/providers/institutional/types.ts` — order request/response types
3. Update `routeOrder` in `sor.ts` — change `venue: "institutional"` when `requires_institutional = true`
4. `execution-submit-child` MCP tool — submit a single child order from a TWAP/VWAP schedule
5. `migrations/0008_algo_schedules.sql` — persist generated schedules for audit trail

**Start next 4b session with:**
```
Build src/providers/institutional/client.ts — REST client for Richard's firm.
Need: base URL, auth scheme (Bearer? HMAC?), order submit endpoint shape.
Check Worked ON/ for any API spec notes first.
```

---

## Open Questions / Blockers
- **Richard's firm API** — Phase 1 + Phase 4b SOR routing blocked.
- **algo schedule persistence** — not yet in D1; can add `0008_algo_schedules.sql` if needed for audit.

---

## V3 Phase Timeline
| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Foundation: signals, WebSocket, decay, execution tracking | ✅ COMPLETE |
| 1 | Institutional data: L2, dark pool, news velocity | 🔴 BLOCKED (API access) |
| 2 | Regime engine + regime-conditional signal routing | ✅ COMPLETE |
| 3 | Quant risk: Kelly, Sharpe, VaR, correlation guard | ✅ COMPLETE |
| 4a | Execution algos: TWAP, VWAP, SOR stub, slippage calc | ✅ COMPLETE |
| 4b | Institutional client wire-in + SOR full routing | 🔴 BLOCKED (Phase 1 API) |
| 5 | Multi-asset: futures hedging, options upgrade | ⬜ Pending Phase 4b |

---

## Partnership Context
**Richard Kim** — former VP at Alpaca, now at institutional HFT clearing firm.
Processes 2-3% of US equity market volume. Direct member of 14 exchanges + all dark pools.
Building a "Master MCP layer" (Polygon SIP, Benzinga, FMP, L2/L3).
Will push real-time signals via the `/stream` WebSocket endpoint (Phase 0).
**Do not build what they already have.** They are the execution partner.

*V3 positioning: not pure HFT. Best-informed, cleanest-executing algorithmic layer a developer can build. Edge = information quality + execution discipline. See `Worked ON/V3_STANDARD_LANGUAGE.md`.*
