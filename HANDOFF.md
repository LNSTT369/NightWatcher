# NIGHTWATCHER V3 — SESSION HANDOFF
**Date:** 2026-05-12
**Branch:** `NIGHTWATCHER-V3`
**Session type:** Phase 4a + Strategy System — Complete

---

## Current Git State
```
Branch:  NIGHTWATCHER-V3
Remote:  pushed ✓
Status:  clean
Latest:  9a70106 feat(strategies): strategy folder system + Momentum Breakout + ORB
```

---

## Live Processes (running now)
```bash
# Dev server
npm run dev  → PID ~50194 (port 8787)

# Strategy runners — both scheduled for market open today (2026-05-12)
node scripts/run.mjs momentum-breakout  → /tmp/nw-momentum.log
node scripts/run.mjs orb               → /tmp/nw-orb.log
```
Paper account: **PA3NCNZJLERG**

---

## Completed Phases

### Phase 0 ✅ Foundation
### Phase 2 ✅ Regime Detection
### Phase 3 ✅ Quant Risk (Kelly, Sharpe, VaR, Correlation)
### Phase 4a ✅ Smart Execution (TWAP, VWAP, SOR, Slippage)

### Strategy System ✅ (this session)

**Structure:**
```
strategies/
  momentum-breakout/    — RSI 40–65 + MACD + above 20-SMA + regime filter
    index.mjs
    config.json
  orb/                  — Opening Range Breakout (1h range + VWAP + 1:2 R:R)
    index.mjs
    config.json
scripts/
  run.mjs               — Universal runner: node scripts/run.mjs <name>
  demo-v3-pipeline.mjs  — One-shot full pipeline demo
```

**To add a new strategy:** create `strategies/<name>/index.mjs`, export `meta`, `scan()`, `onStop()`.

---

## Strategy Specs

### Momentum Breakout
- **Watchlist:** AAPL, MSFT, NVDA, AMZN, META, GOOGL, SPY, QQQ
- **Signal:** RSI 40–65 + MACD bullish histogram + price > 20-day SMA
- **Regime filter:** trending_bull, low_volatility, range_bound only
- **Sizing:** Kelly from journal → SOR → TWAP (3 slices × 10 min, 30 min window)
- **Scans:** 9:30 AM ET + 10:30 AM ET
- **Stop:** 3:59 PM ET

### ORB — Opening Range Breakout
- **Symbol:** SPY (configurable in config.json)
- **Range:** First 1h candle 9:30–10:30 ET (high/low)
- **Entry:** Breakout above ORB high (long) or below ORB low (short)
- **Confirmation:** VWAP computed from intraday 5-min bars
- **R:R:** 1:2 — stop at opposite range boundary, target = 2× risk
- **Time exit:** 3:00 PM ET if stop/target not hit
- **Frequency:** One trade per day; polls every 5 min after 10:30 AM

---

## Phase 1 — BLOCKED
Waiting on Richard Kim's firm API credentials + REST spec.

## Phase 4b — BLOCKED (same)
Institutional client + full SOR routing needs Phase 1 API.

---

## V3 Phase Timeline
| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Foundation: signals, WebSocket, execution tracking | ✅ |
| 1 | Institutional data: L2, dark pool, news velocity | 🔴 BLOCKED |
| 2 | Regime detection engine | ✅ |
| 3 | Quant risk: Kelly, Sharpe, VaR, correlation | ✅ |
| 4a | Execution algos: TWAP, VWAP, SOR stub, slippage | ✅ |
| 4b | Institutional client wire-in | 🔴 BLOCKED |
| Strategy | Folder system + Momentum Breakout + ORB | ✅ |
| 5 | Multi-asset: futures hedging, options upgrade | ⬜ |

---

## Next Session Options
- **Add more strategies** — VWAP Reversion, Gap & Go, Mean Reversion, etc.
- **Review today's trade logs** — check /tmp/nw-momentum.log and /tmp/nw-orb.log after market close
- **Phase 4b** — unblocked when Richard's firm API arrives
- **Phase 5** — futures hedging + options upgrade

## Partnership Context
Richard Kim — institutional HFT clearing firm, 2-3% US equity volume.
Blocked on API spec. Do not build what they already have.
See `Worked ON/V3_STANDARD_LANGUAGE.md` for V3 positioning language.
