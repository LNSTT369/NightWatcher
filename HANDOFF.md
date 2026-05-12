# NIGHTWATCHER V3 — SESSION HANDOFF
**Date:** 2026-05-12
**Branch:** `NIGHTWATCHER-V3`
**Session type:** Strategy Expansion + ORB Backtest Spec Rebuild — Complete

---

## Current Git State
```
Branch:  NIGHTWATCHER-V3
Remote:  pushed ✓
Status:  clean
Latest:  8fea177 feat(orb): multi-asset long-only ORB matching backtest spec
```

---

## What Was Built This Session

### 5 New Strategies (all wired into start.sh)

| Strategy | Scan Times ET | Logic |
|---|---|---|
| `vwap-reversion` | 10:00–14:00 (hourly) | Price ≥1.5% below VWAP + RSI<42 → long. Target: VWAP. 5-min monitor. |
| `gap-and-go` | 9:35 AM | ≥3% gap up + holding → long. 2:1 R:R. Time exit 11 AM. One trade/day. |
| `mean-reversion` | 10:30, 12:00, 13:30 | Price ≥3% below SMA-20 + RSI<40. Range/high-vol regimes only. |
| `futures-hedge` (Phase 5) | 10:00 AM + 15-min poll | SPY short when long exposure >$1500 + bearish regime. Auto-unhedges. |
| `options-momentum` (Phase 5) | 9:30, 10:30 AM | OTM calls on breakout signal. Requires `options_enabled: true` in policy. |

### ORB — Full Rewrite (backtest-matched)

Rebuilt from single-asset SPY to a **10-asset curated universe**, aligned with
backtested MNQ 60m results (May 2022–May 2026, Sharpe 1.48, expectancy 8.82 pts).

**Watchlist rule — 3 criteria for inclusion:**
1. Liquidity: >$1B avg daily dollar volume
2. Range: avg daily range >1% of price (room for 2.5R target)
3. Behaviour: strong trend-following intraday

`SPY, QQQ, IWM` — index ETFs (broad + small-cap)
`XLK` — tech sector ETF
`NVDA, TSLA` — highest ADR mega-caps, strongest trend follow-through
`META, AAPL, MSFT, AMZN` — mega-cap tech, reliable liquidity

**Rate limit math:** 10 symbols × ~2 MCP calls = ~20 calls/poll cycle. Inside Alpaca free-tier.

**Changes from old ORB:**

| | Old | New |
|---|---|---|
| Assets | SPY only | 10-symbol fixed universe |
| Direction | Long + short | Long only (short Sharpe -1.49) |
| Target | 2.0R | 2.5R (backtest optimal) |
| Entry window | All day | Before 12:00 PM ET only |
| VWAP filter | Required | Removed |
| Session exit | 3:00 PM | 3:55 PM |
| Max positions | 1 | 3 simultaneous |

### Dashboard Enhancements

- `ErrorBoundary.tsx` — catches render crashes anywhere in the tree with RETRY button
- **Strategy Status panel** — replaced Signal Research (always empty in V3). Shows all 7 strategies: live/idle dot, fills today, last action + timestamp. Polls `/api/v3/strategies` every 30s.
- `dashboard-api.mjs` — new `GET /api/v3/strategies` endpoint

---

## Full Stack Startup

```bash
# Terminal 1
./start.sh
# Launches: MCP server + dashboard-api + all 7 strategies

# Terminal 2
cd dashboard && npm run dev
```

| Service | URL |
|---|---|
| MCP server | http://localhost:8787 |
| Dashboard API | http://localhost:3001 |
| Dashboard UI | http://localhost:3000 |

Paper account: **PA3NCNZJLERG**

---

## Full Strategy Roster

| # | Strategy | Scans ET | Key Params |
|---|---|---|---|
| 1 | `momentum-breakout` | 9:30, 10:30 | RSI 40–65 + MACD + SMA-20. Kelly→TWAP. |
| 2 | `orb` | 10:30 | 60m range, long-only, 2.5R, noon cutoff, 10 assets |
| 3 | `vwap-reversion` | 10:00–14:00 | VWAP dev ≥1.5% + RSI<42 |
| 4 | `gap-and-go` | 9:35 | ≥3% gap up, 2:1 R:R, exit 11 AM |
| 5 | `mean-reversion` | 10:30, 12:00, 13:30 | SMA-20 dev ≥3% + RSI<40, range/vol only |
| 6 | `futures-hedge` | 10:00 + poll | SPY short overlay, bearish regime trigger |
| 7 | `options-momentum` | 9:30, 10:30 | OTM calls, requires options_enabled=true |

---

## Completed Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation: signals, WebSocket, execution tracking | ✅ |
| 1 | Institutional data: L2, dark pool, news velocity | 🔴 BLOCKED |
| 2 | Regime detection engine | ✅ |
| 3 | Quant risk: Kelly, Sharpe, VaR, correlation | ✅ |
| 4a | Execution algos: TWAP, VWAP, SOR, slippage | ✅ |
| 4b | Institutional client wire-in | 🔴 BLOCKED |
| Strategy | 7-strategy system, all wired to start.sh | ✅ |
| Dashboard | React dashboard + strategy status panel + ErrorBoundary | ✅ |
| 5a | Portfolio hedge overlay (SPY short) | ✅ |
| 5b | Options momentum strategy | ✅ |
| ORB v2 | Multi-asset, backtest-matched spec | ✅ |

---

## Known Issues / Watch Points

- `options-momentum` silently skips until `options_enabled: true` set in policy
- `futures-hedge` short-selling requires margin enabled on paper account (verify once)
- Regime/risk panels show "unavailable" until D1 seeded: `node scripts/demo-v3-pipeline.mjs`
- Strategy Status panel shows "idle" for any strategy not run today — expected on first launch

---

## Blocked Items

- **Phase 1 / Phase 4b** — Waiting on Richard Kim's firm API credentials + REST spec
- Do not build institutional data layer or full SOR routing until spec arrives

---

## Next Session Options

- **Live session review** — after market close check `logs/` for all 7 strategies, tune thresholds
- **Enable options** — `policy-update` MCP tool → `options_enabled: true` → watch options-momentum fire
- **ORB watchlist tuning** — add/remove symbols based on live performance data
- **Dashboard P&L per strategy** — aggregate fills from JSONL into per-strategy stats panel
- **Phase 4b** — unblocked when Richard's API spec arrives

---

## Partnership Context
Richard Kim — institutional HFT clearing firm, 2-3% US equity volume.
Blocked on API spec. Do not build what they already have.
See `Worked ON/V3_STANDARD_LANGUAGE.md` for V3 positioning language.
