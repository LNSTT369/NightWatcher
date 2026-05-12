# NIGHTWATCHER V3 — SESSION HANDOFF
**Date:** 2026-05-12
**Branch:** `NIGHTWATCHER-V3`
**Session type:** Dashboard Wiring + Crash Fix — Complete

---

## Current Git State
```
Branch:  NIGHTWATCHER-V3
Remote:  pushed ✓
Status:  clean
Latest:  c9fef0b fix(dashboard): blank screen crash from missing regime_tags
```

---

## What Was Built This Session

### 1. `scripts/dashboard-api.mjs` (new)
HTTP server on **port 3001** — the bridge between the React dashboard and MCP.

| Endpoint | MCP tool(s) called |
|---|---|
| `GET /api/setup/status` | `auth-verify` |
| `GET /api/status` | `portfolio-get` + `market-clock` + `signal-list` |
| `GET /api/portfolio/history` | `portfolio-history` |
| `GET /api/v3/regime` | `regime-detect` |
| `GET /api/v3/risk` | `risk-kelly-size` + `risk-sharpe` + `risk-var` |
| `GET /api/v3/signals` | `signal-list` (normalized to full AlphaSignal shape) |
| `POST /api/config` | in-memory save |

Key design:
- Persistent MCP SSE connection with auto-reconnect on ECONNREFUSED
- Gracefully returns nulls when MCP is not yet reachable
- Normalizes `signal-list` output to the `AlphaSignal` shape the dashboard expects

### 2. `scripts/run.mjs` (updated)
Every `state.log(tag, msg, data)` call now appends a structured JSON line to `logs/<strategy>-activity.jsonl`. The dashboard-api reads these files for the ACTIVITY FEED panel.

### 3. `start.sh` (updated)
Now a 4-step launch:
```
[1/4] npm run dev        → MCP server (port 8787) + health-check wait
[2/4] dashboard-api.mjs  → Dashboard bridge (port 3001)
[3/4] strategy runners   → momentum-breakout + orb
[4/4] tail -f logs/      → unified log stream
```

### 4. Dashboard crash fix (App.tsx + dashboard-api.mjs)
**Root cause:** `signal-list` MCP tool returns a minimal DB row (`id`, `source`, `symbol`, `direction`, `confidence`, `urgency`, `status`, `created_at`) — NOT the full `AlphaSignal` shape. The Alpha Signals panel did `sig.regime_tags.length` on an undefined field → `TypeError` → React tree crash → blank black screen.

**Fix applied in two places:**
- `dashboard-api.mjs` `handleV3Signals`: maps every signal to full `AlphaSignal` shape, patching `signal_id`, `generated_at`, `ttl_seconds`, `horizon`, `rationale`, `regime_tags: []`
- `App.tsx` line ~754: changed `sig.regime_tags.length > 0` → `(sig.regime_tags?.length ?? 0) > 0` as a defensive guard

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
| 5 | Multi-asset: futures hedging, options upgrade | ⬜ |

---

## Strategy Specs

### Momentum Breakout
- **Watchlist:** AAPL, MSFT, NVDA, AMZN, META, GOOGL, SPY, QQQ
- **Signal:** RSI 40–65 + MACD bullish histogram + price > 20-day SMA
- **Regime filter:** trending_bull, low_volatility, range_bound only
- **Sizing:** Kelly → SOR → TWAP (3 slices × 10 min, 30-min window)
- **Scans:** 9:30 AM ET + 10:30 AM ET  |  **Stop:** 3:59 PM ET

### ORB — Opening Range Breakout
- **Symbol:** SPY
- **Range:** First 1h candle 9:30–10:30 ET
- **Entry:** Breakout above/below ORB range with VWAP confirmation
- **R:R:** 1:2 — stop at opposite range boundary
- **Time exit:** 3:00 PM ET  |  **One trade/day**

---

## Known Issues / Watch Points

- **Activity feed** reads from `logs/*-activity.jsonl`. Files are only created when strategy runners are active. Until strategies start, the feed shows "Waiting for activity…" — expected.
- **Portfolio history chart** shows "Collecting performance data…" for new paper accounts with no history. Mock data kicks in only after `/api/status` returns a real account object.
- **Regime / Risk panels** show "unavailable" if the MCP D1 has no cached data yet. Run the demo pipeline once to seed: `node scripts/demo-v3-pipeline.mjs`

---

## Blocked Items

- **Phase 1 / Phase 4b** — Waiting on Richard Kim's firm API credentials + REST spec.
- Do not build institutional data layer or full SOR routing until API spec arrives.

---

## Next Session Options

- **Phase 5** — futures hedging (MES/ES), options strategy upgrade
- **More strategies** — VWAP Reversion, Gap & Go, Mean Reversion
- **Dashboard enhancements** — add ErrorBoundary component, strategy runner status panel
- **Review trade logs** — check `/tmp/nw-*.log` or `logs/` after a market session
- **Phase 4b** — unblocked when Richard's API spec arrives

## Partnership Context
Richard Kim — institutional HFT clearing firm, 2-3% US equity volume.
Blocked on API spec. Do not build what they already have.
See `Worked ON/V3_STANDARD_LANGUAGE.md` for V3 positioning language.
