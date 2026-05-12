# NIGHTWATCHER V3 — SESSION HANDOFF
**Date:** 2026-05-11
**Branch:** `NIGHTWATCHER-V3`
**Session type:** Phase 0 Build — Complete

---

## Current Git State
```
Branch:  NIGHTWATCHER-V3
Remote:  not yet pushed
Status:  Phase 0 committed — clean working tree
```

---

## Phase 0 — COMPLETE ✅

All Phase 0 tasks are built, typechecked, and committed.

### Files Created (Phase 0)

| File | Purpose |
|------|---------|
| `src/signals/types.ts` | `AlphaSignal` + `AggregatedSignal` interfaces; `SOURCE_WEIGHTS`, `DEFAULT_TTL` |
| `src/signals/aggregator.ts` | Temporal decay aggregator: `score = confidence × exp(-elapsed/ttl) × weight` |
| `migrations/0004_alpha_signals.sql` | `alpha_signals` + `aggregated_signals` D1 tables |
| `migrations/0005_execution_fills.sql` | `execution_fills` table with slippage_bps tracking |
| `src/storage/d1/queries/signals.ts` | `insertAlphaSignal`, `getPendingSignals`, `listRecentSignals`, `insertAggregatedSignal`, `cleanupExpiredSignals` |
| `src/storage/d1/queries/execution_fills.ts` | `recordExecutionFill` (auto-computes slippage), `getExecutionReport` |
| `src/stream/handler.ts` | WebSocket `/stream` endpoint — subscribe/unsubscribe/signal/ping protocol |

### Files Modified (Phase 0)

| File | Change |
|------|--------|
| `src/storage/kv/keys.ts` | Added V3 cache keys + TTLs: pendingSignals, aggregatedSignal, currentRegime, newsVelocity, sourceWeight |
| `src/storage/kv/client.ts` | Added `CacheEntry<T>`, `cacheEntryFreshness()`, `setTracked()`, `getTracked()` |
| `src/jobs/cron.ts` | `runMidnightReset` now calls `cleanupExpiredSignals(db)` |
| `src/index.ts` | Added `/stream` route → `handleStreamConnection` |
| `src/mcp/agent.ts` | Added `registerSignalTools(db)` + `registerExecutionTools(db)`; updated `catalog-list` with Signal + Execution categories |

### MCP Tools Added (Phase 0)

**Signal category:**
- `signal-submit` — ingest a raw alpha signal (any source type)
- `signal-list` — list recent signals with optional filters (symbol, source, direction)
- `signal-aggregate` — run weighted temporal decay aggregation for a symbol; persists result

**Execution category:**
- `execution-report` — slippage, fill latency, dark pool %, venue breakdown over N days
- `execution-record-fill` — manually record a fill for tracking

---

## Key Architecture Decisions (locked in Phase 0)

### AlphaSignal Contract
Every signal source emits `AlphaSignal`:
`signal_id · source · symbol · direction · confidence · urgency · horizon · ttl_seconds`

Source weights (hardcoded defaults, Phase 2 will make configurable):
```
dark_pool=0.90  l2_microstructure=0.80  external=0.70
technical=0.60  llm=0.40                manual=0.95
```

### Freshness Decay Formula
`freshness = exp(-elapsed_seconds / ttl_seconds)` — same formula in aggregator AND KV client. One consistent concept throughout the system.

### WebSocket Protocol (`/stream`)
```
Inbound:  { type: "subscribe"|"unsubscribe", symbols: string[] }
          { type: "signal", payload: Omit<AlphaSignal, "signal_id"|"generated_at"> }
          { type: "ping" }
Outbound: { type: "subscribed", symbols: string[] }
          { type: "signal_accepted", signal_id: string, symbol: string }
          { type: "pong", ts: string }
          { type: "error", message: string }
```
This is the ingest endpoint for Richard's firm to push real-time signals.

### Execution Fill Tracking
`slippage_bps = ((fill_price - expected_price) / expected_price) × 10000`
Stored per-fill. `execution-report` tool aggregates by day range and venue.

---

## Partnership Context (unchanged)
**Richard Kim** — former VP at Alpaca, now at institutional HFT clearing firm.
His firm processes 2-3% of total US equity market volume, 0 outages in 2024.
Direct member of 14 exchanges + all dark pools. Building a "Master MCP layer"
aggregating Polygon SIP data, Benzinga news, FMP analyst data, L2/L3.
They will push signals via the `/stream` WebSocket endpoint we just built.
**They are the execution partner for V3. Do not build what they already have.**

---

## Exact Next Step — Phase 1 (blocked) OR Phase 2 (can build now)

### Option A — Phase 1: Institutional Data Integration (BLOCKED)
Blocked on: Richard's firm API credentials + REST spec.
Cannot build until we have their endpoint URL and auth scheme.
Start here once API access is received.

### Option B — Phase 2: Regime Detection Engine (CAN BUILD NOW)
The regime engine classifies current market state and routes signals accordingly.
No external API required — uses Alpaca market data + computed signals.

**Regime states to detect:**
```
trending_bull | trending_bear | range_bound | high_volatility | low_volatility | crisis
```

**Files to create:**
- `src/regime/types.ts` — `MarketRegime` union type + `RegimeState` interface
- `src/regime/detector.ts` — regime classification logic (VIX proxy, trend, vol)
- `src/storage/d1/queries/regime.ts` — `insertRegimeSnapshot`, `getLatestRegime`
- `migrations/0006_regime.sql` — `regime_snapshots` table
- MCP tool: `regime-detect` — trigger detection + store result
- MCP tool: `regime-history` — list past regime states

**Regime detection signals (using existing Alpaca data):**
1. ADX > 25 → trending; < 20 → range-bound
2. SPY 20-day return → bull/bear direction
3. Price volatility (rolling std of returns) → high/low vol
4. ATR as fraction of price → crisis signal

**Regime affects:**
- Signal aggregator: high-vol regime → tighten confidence thresholds
- Order sizing: range-bound → reduce position size 50%
- TTL override: crisis regime → all signals expire in 30s regardless of source TTL

**Start session with:**
```
Create src/regime/types.ts with MarketRegime union and RegimeState interface.
```

---

## Open Questions / Blockers
- **API access from Richard's firm** — Phase 1 cannot start without credentials
- **Execution venue API spec** — Phase 4 abstraction layer ready, awaiting spec
- **Futures API** — Phase 5, not a current blocker

---

## V3 Phase Timeline (reference)
| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Foundation: signals, WebSocket, decay, execution tracking | ✅ COMPLETE |
| 1 | Institutional data: L2, dark pool, news velocity | 🔴 BLOCKED (API access) |
| 2 | Regime engine + regime-conditional signal routing | 🟡 READY TO BUILD |
| 3 | Quant risk: Sharpe, VaR, Kelly, factor exposure | ⬜ Pending Phase 2 |
| 4 | Smart execution: SOR, algos, dark pool routing | ⬜ Pending API spec |
| 5 | Multi-asset: futures hedging, options upgrade | ⬜ Pending Phase 4 |
