# NIGHTWATCHER V3 — SESSION HANDOFF
**Date:** 2026-05-12
**Branch:** `NIGHTWATCHER-V3`
**Session type:** Strategy Expansion + Dashboard Enhancements — Complete

---

## Current Git State
```
Branch:  NIGHTWATCHER-V3
Remote:  not yet pushed this session
Status:  modified (agent.mjs, dashboard files, scripts, strategies)
Latest:  f83fc34 docs: session handoff — dashboard wired, blank screen crash fixed
```

---

## What Was Built This Session

### 5 New Strategies

All live in `strategies/<name>/index.mjs` + `config.json`. Run with `node scripts/run.mjs <name>`.

#### Core (runs every session)

| Strategy | File | Scan Times ET | Logic |
|---|---|---|---|
| `vwap-reversion` | `strategies/vwap-reversion/` | 10–14:00 hourly | Price ≥1.5% below VWAP + RSI<42 → long. Target: VWAP. 5-min position monitor. |
| `gap-and-go` | `strategies/gap-and-go/` | 9:35 AM | ≥3% gap up + holding at open → long. Target: 2× gap. Time exit 11 AM. |
| `mean-reversion` | `strategies/mean-reversion/` | 10:30, 12:00, 13:30 | Price ≥3% below SMA-20 + RSI<40. Range/high-vol regimes only. Target: SMA-20. |

#### Phase 5 (run every session, dormant until conditions met)

| Strategy | File | Activation Trigger |
|---|---|---|
| `futures-hedge` | `strategies/futures-hedge/` | Long exposure >$1500 + trending_bear/high_volatility/crisis regime → short SPY overlay. Polls every 15 min. |
| `options-momentum` | `strategies/options-momentum/` | Same breakout signal as momentum-breakout but buys OTM calls. **Requires `options_enabled: true` in policy config** (default: false). Exits gracefully if disabled. |

### `start.sh` updated — all 7 strategies launch by default
```
./start.sh
# → momentum-breakout, orb, vwap-reversion, gap-and-go, mean-reversion, futures-hedge, options-momentum
```
Pass strategy names as args to run a subset: `./start.sh momentum-breakout orb`

### Dashboard Enhancements

**`dashboard/src/components/ErrorBoundary.tsx`** (new)
- React class component. Catches render errors anywhere in the tree.
- Shows panel-style error card with RETRY button.
- Wraps the full App render and the Strategy Status panel individually.

**Strategy Status Panel** (replaced Signal Research panel — bottom-right of grid)
- Shows all 7 strategies detected in `strategies/` dir.
- Live/idle indicator dot (green pulse if logged activity in last 8 hours).
- Per-strategy: today's fill count, last action + timestamp.
- Polls `/api/v3/strategies` every 30s.

**`scripts/dashboard-api.mjs` — new endpoint**
- `GET /api/v3/strategies` — scans `strategies/` dir, reads `logs/<name>-activity.jsonl`, returns status, last activity, fills today for each strategy.

---

## Full Stack Startup

```bash
# Terminal 1 — everything backend
./start.sh

# Terminal 2 — dashboard UI
cd dashboard && npm run dev
```

| Service | URL |
|---|---|
| MCP server (wrangler) | http://localhost:8787 |
| Dashboard API bridge | http://localhost:3001 |
| Dashboard UI (Vite) | http://localhost:3000 |

Paper account: **PA3NCNZJLERG**

---

## Completed Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation: signals, WebSocket, execution tracking | ✅ |
| 1 | Institutional data: L2, dark pool, news velocity | 🔴 BLOCKED |
| 2 | Regime detection engine | ✅ |
| 3 | Quant risk: Kelly, Sharpe, VaR, correlation | ✅ |
| 4a | Execution algos: TWAP, VWAP, SOR stub, slippage | ✅ |
| 4b | Institutional client wire-in | 🔴 BLOCKED |
| Strategy | Folder system + Momentum Breakout + ORB | ✅ |
| Dashboard | React dashboard wired to V3 MCP backend | ✅ |
| 5a | Portfolio hedge overlay (SPY short) | ✅ |
| 5b | Options momentum strategy | ✅ |
| Strategies+ | VWAP Reversion, Gap & Go, Mean Reversion | ✅ |
| Dashboard+ | ErrorBoundary + Strategy Status panel | ✅ |

---

## Strategy Specs (full roster)

### Momentum Breakout
- **Watchlist:** AAPL, MSFT, NVDA, AMZN, META, GOOGL, SPY, QQQ
- **Signal:** RSI 40–65 + MACD bullish histogram + price > 20-day SMA
- **Regime filter:** trending_bull, low_volatility, range_bound
- **Sizing:** Kelly → SOR → TWAP (3 slices × 10 min, 30-min window)
- **Scans:** 9:30 AM + 10:30 AM | **Stop:** 3:59 PM

### ORB — Opening Range Breakout
- **Symbol:** SPY | **Range:** First 1h candle 9:30–10:30 ET
- **Entry:** Breakout + VWAP confirmation | **R:R:** 1:2
- **Scans:** 10:30 AM | **Stop:** 3:59 PM | One trade/day

### VWAP Reversion
- **Watchlist:** AAPL, MSFT, NVDA, AMZN, META, GOOGL, SPY, QQQ
- **Signal:** Price ≥1.5% below VWAP + RSI <42
- **Regime filter:** range_bound, high_volatility, low_volatility
- **Monitor:** 5-min poll after entry | **Scans:** 10:00–14:00 (hourly) | **Stop:** 3:30 PM

### Gap & Go
- **Watchlist:** AAPL, MSFT, NVDA, AMZN, META, GOOGL, SPY, QQQ
- **Signal:** ≥3% gap up + holding within 0.5% of open at 9:35 AM
- **R:R:** 1:2 (stop = prior close, target = entry + 2× gap size)
- **Time exit:** 11:00 AM | One trade/day | **Scans:** 9:35 AM

### Mean Reversion
- **Watchlist:** AAPL, MSFT, NVDA, AMZN, META, GOOGL
- **Signal:** Price ≥3% below SMA-20 + RSI <40
- **Regime filter:** range_bound, high_volatility only
- **Target:** SMA-20 | **Scans:** 10:30, 12:00, 13:30 | **Stop:** 3:59 PM

### Portfolio Hedge (Phase 5)
- **Symbol:** SPY short | **Trigger:** Long exposure >$1500 + bearish/volatile regime
- **Unhedge:** Exposure <$800 or regime normalizes | **Poll:** Every 15 min
- **Scans:** 10:00 AM | **Stop:** 3:30 PM

### Options Momentum (Phase 5)
- **Watchlist:** AAPL, MSFT, NVDA, AMZN, META
- **Signal:** Same as Momentum Breakout, confidence ≥0.75
- **Options:** OTM calls, delta ~0.35, DTE 14–45 days
- **Requires:** `options_enabled: true` in policy (disabled by default)
- **Scans:** 9:30 AM + 10:30 AM | **Stop:** 3:30 PM

---

## Known Issues / Watch Points

- **options-momentum** logs `options_enabled=false` and exits every scan until policy is updated. To enable: use `policy-update` MCP tool or run `node scripts/demo-v3-pipeline.mjs`
- **futures-hedge** short selling requires margin account on Alpaca (paper account should support it, but may need to verify)
- **Activity feed** reads from `logs/*-activity.jsonl`. Files are created when strategies first log activity.
- **Strategy Status panel** shows "idle" for any strategy not yet run today — expected on first launch.
- **Regime/Risk panels** show "unavailable" if no D1 data yet: `node scripts/demo-v3-pipeline.mjs` seeds them.

---

## Blocked Items

- **Phase 1 / Phase 4b** — Waiting on Richard Kim's firm API credentials + REST spec.
- Do not build institutional data layer or full SOR routing until API spec arrives.

---

## Next Session Options

- **Enable options trading** — `policy-update` to set `options_enabled: true`, then watch options-momentum fire
- **Review first live session** — check `logs/` after market close for all 7 strategy outputs
- **Strategy tuning** — adjust config.json thresholds based on paper trading results
- **Dashboard v2** — add P&L per strategy, win-rate tracker from fill history
- **Phase 4b** — unblocked when Richard's API spec arrives

---

## Partnership Context
Richard Kim — institutional HFT clearing firm, 2-3% US equity volume.
Blocked on API spec. Do not build what they already have.
See `Worked ON/V3_STANDARD_LANGUAGE.md` for V3 positioning language.
