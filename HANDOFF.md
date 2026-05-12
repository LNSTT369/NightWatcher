# NIGHTWATCHER V3 — SESSION HANDOFF
**Date:** 2026-05-12
**Branch:** `NIGHTWATCHER-V3`
**Session type:** Bug fixes + Operational reliability — Complete

---

## Current Git State
```
Branch:  NIGHTWATCHER-V3
Remote:  pushed ✓
Latest:  b2f97d1 feat(runner): MCP auto-reconnect + tmux persistent session support
```

Uncommitted (pre-existing dashboard visual overhaul from last session — not yet committed):
- `agent.mjs` — new API endpoints: `/api/v3/regime`, `/api/v3/risk`, `/api/v3/signals`
- `dashboard/index.html` — new fonts (Oswald, Barlow Condensed)
- `dashboard/src/components/Panel.tsx` — accent color + corner bracket support
- `dashboard/src/index.css` — full amber phosphor theme redesign + scanline animation
- `dashboard/src/types.ts` — V3 types: `RegimeState`, `KellyData`, `SharpeData`, `VaRData`, `RiskMetrics`, `AlphaSignal`

---

## What Was Fixed This Session

### 1. demo-v3-pipeline.mjs crash at Step 9 (`execution-record-fill`)
**Root cause:** Alpaca paper mode returns `estimated_price: 0` on `orders-preview`. The Zod schemas for `execution-record-fill` and `execution-slippage-calc` used `.positive()` which rejects 0 — Zod validation failed before the handler ran, and the MCP SDK returned a plain-text `"MCP error -32602: ..."` string. The `tool()` helper then did a bare `JSON.parse()` on that string and threw a cryptic `SyntaxError`.

**Fixes (commit `63239aa`):**
- `src/mcp/agent.ts`: `fill_price`, `expected_price`, `vwap_at_fill` changed from `.positive()` to `.nonnegative()` in both tools — `calcSlippageBps` already handles 0 by returning null
- `scripts/demo-v3-pipeline.mjs`: `tool()` helper wraps `JSON.parse` in try/catch and surfaces the real MCP error text
- `scripts/demo-v3-pipeline.mjs`: price fields conditionally omitted when value is 0

### 2. Strategy runners die silently when wrangler dev restarts
**Root cause:** `run.mjs` opened a single SSE connection at startup with no reconnect logic. Any wrangler restart (file change, crash) left all strategy clients with dead connections — tool calls failed silently.

**Fix (commit `b2f97d1`):**
- `scripts/run.mjs`: `connectMcp()` retries indefinitely on connect failure (10s backoff)
- `scripts/run.mjs`: `makeClientProxy()` wraps every tool call — retries up to 3× with 5s backoff + reconnect between attempts

### 3. Terminal close kills everything
**Fix (commit `b2f97d1`):**
- `start.sh`: `--tmux` flag launches the full stack in a detached tmux session
- Session name: `nightwatcher` — reuses existing session if already running

---

## Operational Setup (Complete)

### Daily startup
```bash
./start.sh --tmux           # launch detached — survives terminal close
tmux attach -t nightwatcher  # reattach any time
tmux kill-session -t nightwatcher  # manual stop
```

### Crontab (already live)
```
25 9 * * 1-5 /bin/bash -lc 'cd "/Users/user/Desktop/NIGHTWATCHER V2" && ./start.sh --tmux' >> "/Users/user/Desktop/NIGHTWATCHER V2/logs/cron.log" 2>&1
```
Fires at 9:25 AM ET Mon–Fri. Errors log to `logs/cron.log`.
`/bin/bash -lc` ensures nvm/node/wrangler/tmux are all on PATH.

### Dashboard (optional, open/close freely)
```bash
cd dashboard && npm run dev   # port 3000 — read-only UI, no effect on strategies
```
MCP server (8787) and dashboard API (3001) stay alive in tmux regardless.

### Mac stays awake
```bash
caffeinate -i ./start.sh --tmux  # prevents sleep for the life of the session
```

---

## Full Strategy Roster

| # | Strategy | Scans ET | Stop ET |
|---|---|---|---|
| 1 | `momentum-breakout` | 9:30, 10:30 AM | 3:30 PM |
| 2 | `orb` | 10:30 AM | 3:55 PM |
| 3 | `vwap-reversion` | 10:00–14:00 hourly | 3:30 PM |
| 4 | `gap-and-go` | 9:35 AM | — |
| 5 | `mean-reversion` | 10:30, 12:00, 13:30 | 3:30 PM |
| 6 | `futures-hedge` | 10:00 AM + 15-min poll | — |
| 7 | `options-momentum` | 9:30, 10:30 AM | — |

---

## Today's Scan Results (2026-05-12)

**vwap-reversion 11:00 AM scan:**
| Symbol | Price | VWAP | Dev | RSI | Result |
|---|---|---|---|---|---|
| AAPL | $294.25 | $293.12 | -0.38% | 64.0 | Skip — above VWAP |
| NVDA | $218.34 | $220.87 | +1.15% | 44.8 | Skip — 0.35% short of 1.5% threshold |
| SPY | $734.05 | $735.71 | +0.23% | 34.4 | Skip — below threshold |

No entries triggered today. Closest: NVDA at 1.15% below VWAP (threshold: 1.5%).

**vwap-reversion 12:00 PM scan:** Same prices — no new entries.

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
| Ops | tmux persistence + MCP reconnect + cron | ✅ |

---

## Known Issues / Watch Points

- `options-momentum` silently skips until `options_enabled: true` set in policy
- `futures-hedge` short-selling requires margin enabled on paper account
- Dashboard visual overhaul (amber phosphor theme) is uncommitted — see git status
- If Mac sleeps, tmux session pauses; use `caffeinate` if leaving it unattended overnight

---

## Blocked Items

- **Phase 1 / Phase 4b** — Waiting on Richard Kim's firm API credentials + REST spec
- Do not build institutional data layer or full SOR routing until spec arrives

---

## Next Session Options

- **Commit dashboard overhaul** — 5 modified files (`agent.mjs`, `Panel.tsx`, `index.css`, `types.ts`, `index.html`) ready to stage
- **Lower vwap-reversion threshold** — NVDA came within 0.35% today; consider tuning `deviation_pct` from 1.5% to 1.2%
- **Review first live day logs** — after tomorrow's market session check `logs/` for all 7 strategies
- **Dashboard P&L per strategy** — aggregate fills from JSONL into per-strategy stats panel
- **Phase 4b** — unblocked when Richard's API spec arrives

---

## Partnership Context
Richard Kim — institutional HFT clearing firm, 2-3% US equity volume.
Blocked on API spec. Do not build what they already have.
See `Worked ON/V3_STANDARD_LANGUAGE.md` for V3 positioning language.
