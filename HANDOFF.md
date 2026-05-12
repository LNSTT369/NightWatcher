# NIGHTWATCHER V3 — SESSION HANDOFF
**Date:** 2026-05-11
**Branch:** `NIGHTWATCHER-V3`
**Session type:** Phase 2 Build — Regime Detection Engine — Complete

---

## Current Git State
```
Branch:  NIGHTWATCHER-V3
Remote:  not yet pushed
Status:  Phase 2 committed — clean working tree
```

---

## Completed Phases

### Phase 0 ✅ — Foundation (previous session)
AlphaSignal interface, aggregator, WebSocket /stream, execution fill tracking, signal MCP tools.

### Phase 2 ✅ — Regime Detection Engine (this session)

**Files created:**

| File | Purpose |
|------|---------|
| `src/regime/types.ts` | `MarketRegime` union, `RegimeState` interface, `REGIME_PARAMS` risk overrides |
| `src/regime/detector.ts` | `detectRegime()` — ADX, ATR%, realized vol, SPY 20d return → regime classification |
| `src/storage/d1/queries/regime.ts` | `insertRegimeSnapshot`, `getLatestRegime`, `listRegimeHistory` |
| `migrations/0006_regime.sql` | `regime_snapshots` table |

**MCP Tools added:**
- `regime-detect` — fetches 35 SPY daily bars, classifies regime, persists to D1, respects 5-min TTL cache
- `regime-history` — lists past regime snapshots (default 20)

**Catalog updated:** added `Regime` category.

---

## Regime Classification Logic

Uses SPY daily bars (35 bars → 20-day lookback + ADX buffer). No external API needed.

```
Crisis:          ATR% > 3.0% OR realized_vol > 60%
High volatility: ATR% > 1.8% OR realized_vol > 35%
Trending:        ADX > 25  →  bull (SPY 20d return > 0) or bear (< 0)
Low volatility:  ATR% < 0.6% AND realized_vol < 12%
Range-bound:     fallback (ADX < 25, vol normal)
```

**Regime risk overrides (applied to signal routing):**

| Regime | Min Confidence | Position Size | Signal TTL Override |
|--------|---------------|---------------|---------------------|
| trending_bull | 0.55 | 100% | none |
| trending_bear | 0.60 | 75% | none |
| range_bound | 0.65 | 50% | none |
| high_volatility | 0.70 | 60% | 120s |
| low_volatility | 0.50 | 100% | none |
| crisis | 0.85 | 25% | 30s |

**ADX** is computed in `detector.ts` (not in `technicals.ts`) because it requires bar H/L/C — Wilder smoothing over directional movement.

---

## Phase 1 — BLOCKED
Waiting on Richard Kim's firm API credentials + REST spec.
Once received: build institutional data client under `src/providers/institutional/`.

---

## Next Step — Phase 3: Quant Risk Framework

Phase 3 builds the quantitative risk layer that sits between signal aggregation and order sizing.

**What it provides:**
- Kelly criterion position sizing (replaces flat `suggested_pct_equity`)
- Sharpe ratio tracking per strategy/symbol
- Value-at-Risk (VaR) estimate for the current portfolio
- Correlation guard — prevents over-concentration in correlated positions

**Files to create:**
- `src/risk/kelly.ts` — Kelly fraction: `f = (bp - q) / b` where b=odds, p=win rate, q=1-p
- `src/risk/sharpe.ts` — rolling Sharpe: `(avg_return - rf) / std_return × sqrt(252)`
- `src/risk/var.ts` — Historical VaR at 95%/99% confidence using trade journal returns
- `src/risk/correlation.ts` — Pearson correlation guard across open positions
- `src/storage/d1/queries/risk_metrics.ts` — persist/retrieve Sharpe, VaR, Kelly snapshots
- `migrations/0007_risk_metrics.sql` — `risk_metric_snapshots` table
- MCP tools: `risk-kelly-size`, `risk-sharpe`, `risk-var`, `risk-correlation-check`

**Key formulas:**
```
Kelly:  f* = (p × b - q) / b       (cap at 0.25 to prevent overbetting)
Sharpe: (mean_daily_return - rf) / std_daily_return × sqrt(252)
VaR95:  5th percentile of historical return distribution × portfolio_value
```

**Data source for Phase 3:** trade journal (D1 `trade_journal` table) already has pnl_usd, pnl_pct, entry/exit prices — enough to compute rolling Sharpe and historical VaR without external data.

**Start next session with:**
```
Create src/risk/kelly.ts — Kelly criterion position sizer.
Input: win_rate, avg_win_pct, avg_loss_pct, kelly_fraction_cap (default 0.25).
Output: recommended_pct_equity capped at the fraction cap.
```

---

## Open Questions / Blockers
- **Richard's firm API** — Phase 1 blocked. Phase 3 can proceed independently.
- **Execution venue API spec** — Phase 4. Abstraction layer built in Phase 0; awaiting spec.

---

## V3 Phase Timeline
| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Foundation: signals, WebSocket, decay, execution tracking | ✅ COMPLETE |
| 1 | Institutional data: L2, dark pool, news velocity | 🔴 BLOCKED (API access) |
| 2 | Regime engine + regime-conditional signal routing | ✅ COMPLETE |
| 3 | Quant risk: Kelly, Sharpe, VaR, correlation guard | 🟡 READY TO BUILD |
| 4 | Smart execution: SOR, algos, dark pool routing | ⬜ Pending API spec |
| 5 | Multi-asset: futures hedging, options upgrade | ⬜ Pending Phase 4 |

---

## Partnership Context
**Richard Kim** — former VP at Alpaca, now at institutional HFT clearing firm.
Processes 2-3% of US equity market volume. Direct member of 14 exchanges + all dark pools.
Building a "Master MCP layer" (Polygon SIP, Benzinga, FMP, L2/L3).
Will push real-time signals via the `/stream` WebSocket endpoint (Phase 0).
**Do not build what they already have.** They are the execution partner.

*V3 positioning: not pure HFT. Best-informed, cleanest-executing algorithmic layer a developer can build. Edge = information quality + execution discipline. See `Worked ON/V3_STANDARD_LANGUAGE.md`.*
