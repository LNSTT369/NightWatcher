# NIGHTWATCHER V3 — SESSION HANDOFF
**Date:** 2026-05-13
**Branch:** `NIGHTWATCHER-V3`
**Session type:** Ops fixes + Vision crystallization + Options sell-side unlock

---

## Current Git State
```
Branch:  NIGHTWATCHER-V3
Latest:  5707315 feat(orb): backtest-driven watchlist + presentation strategy cards
```

Uncommitted changes this session (stage and commit at session end):
- `src/providers/alpaca/market-data.ts` — getBars default start date fix
- `strategies/options-momentum/index.mjs` — removed broken policy-get call, safe t() JSON parse
- `src/policy/config.ts` — OptionsStrategy type + allowed_strategies expanded (sell-side unlock)
- `src/policy/engine.ts` — checkOptionsStrategy extended (covered_call, cash_secured_put, short_call, short_put)
- `README.V3.md` — new V3 vision README (universal execution layer)
- `scripts/scan-now.mjs` — new utility: fire immediate scan bypassing scheduler

---

## What Was Done This Session

### 1. Cron job was failing — Fixed
**Root cause:** macOS cron daemon didn't have Full Disk Access. Fires at 9:25 AM ET Mon–Fri.
**Fix:** Granted Full Disk Access to `/usr/sbin/cron` via System Settings → Privacy & Security → Full Disk Access. Toggle is now ON.
**Verified:** Re-ran cron command manually — exit 0, tmux session detected as already running.

### 2. prices-bars only returning today's bar — Fixed
**Root cause:** Alpaca API without a `start` date defaults to today only, regardless of `limit`.
**Fix:** `src/providers/alpaca/market-data.ts` `getBars()` — computes a default `start` when caller omits it, based on timeframe x limit x 2 calendar days. Applies to both stock and crypto paths.
**Impact:** ORB ADR filter now works — was blocking every symbol with "ADR unavailable". After fix, ORB correctly filtered SPY (ADR 0.90% dead zone), TSLA triggered a long breakout at $445.77.

### 3. options-momentum crashing on JSON parse — Fixed
**Root cause:** Strategy called `t(client, "policy-get")` — that tool does not exist. MCP returns plain-text error, bare `JSON.parse()` throws.
**Fix:** `strategies/options-momentum/index.mjs` — removed `checkOptionsEnabled` / `policy-get` call entirely (policy enforcement already happens in `options-order-preview` downstream). Wrapped `t()` in try/catch — returns `{ ok: false, _raw: text }` on parse failure instead of throwing.
**Result:** Strategy now runs clean. Regime gate (`range_bound` not in allowed list) correctly skips it.

### 4. scan-now.mjs — New utility
`scripts/scan-now.mjs` — fires immediate scans for one or more strategies, bypassing time scheduling.
```bash
node scripts/scan-now.mjs momentum-breakout orb mean-reversion options-momentum
```

### 5. Options sell-side unlocked
**Strategies added to policy engine:**
- `covered_call` — sell call against long equity position
- `cash_secured_put` — sell put with cash collateral
- `short_call` — naked short call (not in default allowed list, must be explicitly enabled)
- `short_put` — naked short put (not in default allowed list, must be explicitly enabled)
**Default allowed when options_enabled=true:** `long_call`, `long_put`, `covered_call`, `cash_secured_put`
**Files:** `src/policy/config.ts`, `src/policy/engine.ts`

### 6. README.V3.md — Vision document
Full V3 positioning as universal execution layer. Architecture diagram, full MCP surface, all supported strategy types, data infrastructure status, standard HFT disclaimer.

---

## V3 Mission — Crystallized This Session

**NightWatcher V3 is a standalone execution layer.**

Not a strategy. Not opinionated about markets. One job: take a signal from any source and execute with institutional-grade quality.

Three layers:
1. **Alpha socket** — open MCP interface, any signal source connects
2. **Smart validator** — policy engine, risk framework, HMAC approval flow
3. **Institutional execution client** — TWAP, VWAP, SOR, all venues, all asset types

All future work is measured against this mission.

---

## Today's Scan Results (2026-05-13)

After prices-bars fix, re-scanned ~10:47 AM ET:
- **momentum-breakout:** All 8 passed → META selected → BUY 1 META executed
- **orb:** 10 ranges captured → TSLA long breakout $445.77 → BUY 1 TSLA executed. SPY dead zone (ADR 0.90%). Others: NR percentile unavailable (insufficient hourly history, normal intraday).
- **mean-reversion:** NVDA -3.49% above SMA20. Nothing hit threshold.
- **options-momentum:** Ran clean. Skipped — regime `range_bound` not in allowed list.

---

## Known Issues / Watch Points

- **ORB NR percentile unavailable** — `fetchHistoricalRanges` needs more 1-hour bars across multiple trading days. Same fix pattern as daily bars — push start date further back.
- **options_enabled still false by default** — Flip via `policy-update` tool to actually trade options.
- **futures-hedge short-selling** — Requires margin on paper account. Silently skips.
- **options-momentum** — Only fires in `trending_bull` / `trending_bear` regime.

---

## Next Session Options

- **NR percentile fix** — Push `fetchHistoricalRanges` start date back to cover 15+ trading days of 1-hour bars.
- **Enable options on paper** — Set `options_enabled: true`, test covered call end-to-end.
- **External signal interface spec** — Document the canonical V3 public API for external strategies.
- **Multi-leg options** — Iron condor, bull call spread as named strategies.
- **Phase 1 / 4b** — Unblocked when Richard Kim's API spec arrives.

---

## Operational Status

```
tmux session:     nightwatcher (running)
MCP server:       http://localhost:8787 ✓
Dashboard API:    http://localhost:3001 ✓
Cron:             9:25 AM ET Mon–Fri — Full Disk Access granted ✓
All 7 strategies: running in tmux
```

---

## Partnership Context
Richard Kim — institutional HFT clearing firm, 2-3% US equity volume, 14 exchanges + all dark pools.
Blocked on API spec. Do not build what they already have.
See `Worked ON/V3_STANDARD_LANGUAGE.md` for required V3 positioning language.
See `README.V3.md` for the full V3 vision document (written this session).
