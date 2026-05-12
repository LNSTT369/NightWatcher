# NIGHTWATCHER V3 — SESSION HANDOFF
**Date:** 2026-05-12
**Branch:** `NIGHTWATCHER-V3`
**Session type:** ORB v2 Strategy + Dashboard Commit — Complete

---

## Current Git State
```
Branch:  NIGHTWATCHER-V3
Remote:  pushed ✓
Latest:  349e375 feat(orb): v2 — ADR%+NR+Regime filters, per-symbol R, Gemini universe
Prior:   265e1fc feat(dashboard): amber phosphor theme + V3 API endpoints
```

All files committed and pushed. Working tree clean.

---

## What Was Done This Session

### 1. ORB Strategy v2 (`strategies/orb/`)

**Background:** User had run a 12-year ORB backtest across 18 tickers (`/Users/user/Desktop/backtest/`) and side-channel Gemini research validating ADR% + Narrow Range as the dominant filters. The live strategy's old watchlist (SPY, QQQ, IWM, AAPL, MSFT, META, XLK) failed the ADR% dead-zone test.

**`strategies/orb/config.json`** — full rewrite:
- New watchlist (11 symbols): NVDA, TSLA, AMD, NFLX, AMZN, MU, BILI, COIN, PLTR, HOOD, ABNB
- Per-symbol R targets from backtest grid: AMZN=3.0, NVDA=1.0, AMD=1.0, COIN=1.5, HOOD=1.5, PLTR=2.0, ABNB=1.5, default=2.0
- `risk_per_trade_usd: 5` for ADR-anchored sizing
- Full `filters` block: ADR, narrow_range, regime

**`strategies/orb/index.mjs`** — v2 rewrite:
- `computeADR()` — 20-day avg `(H-L)/C × 100`
- `fetchHistoricalRanges()` — 20d of 10:30 ET 60m candles for NR percentile
- `detectRegime()` — calls `regime-detect` MCP tool, cached once per scan day
- Three filter gates in `checkBreakouts()` (logged with `FILTER` tag):
  1. **ADR% gate** — skip if <1.2% (dead zone); warn if 1.2–1.5%
  2. **Narrow Range** — skip if today's range > 50th percentile of 20d history; NVDA exempt (NR hurts NVDA per sandbox)
  3. **Regime gate** — skip all longs if regime = bearish
- Risk-anchored sizing: `qty = min(floor(risk_per_trade_usd / stop_dist), floor(notional / price))`
- Per-symbol R applied at `enterLong()` for stop/target calc and logging

Scheduler unchanged — still fires at 10:30 AM ET via tmux/cron.

### 2. Dashboard Overhaul Committed (pre-existing from prior session)
- `agent.mjs` — `/api/v3/regime`, `/api/v3/risk`, `/api/v3/signals` endpoints
- `dashboard/index.html` — Oswald + Barlow Condensed fonts
- `dashboard/src/components/Panel.tsx` — accent color + corner bracket support
- `dashboard/src/index.css` — amber phosphor theme + scanline animation
- `dashboard/src/types.ts` — V3 types: RegimeState, KellyData, SharpeData, VaRData, RiskMetrics, AlphaSignal

---

## Backtest Research (for reference)

Source: `/Users/user/Desktop/backtest/` — 18 tickers, 12-year history
Gemini session notes: `/Users/user/Desktop/gemini discussion.txt`

**Top performers (Sharpe):**
| Symbol | Best Config | Sharpe | Notes |
|---|---|---|---|
| AMZN | Long 3.0R | 2.19 | Best in class |
| NVDA | Long 1.0R | 2.09 | Momentum monster; NR filter hurts it |
| COIN | Long 1.5R | 2.06 | Small sample (146 trades) |
| HOOD | Long 1.5R | 1.83 | High Sharpe, -$2.73 PnL — slippage risk |
| AMD  | Long 1.0R | 1.68 | Solid, consistent |

**Dead Zone (excluded):** KO (-0.35), TMUS (0.28), XOM (0.34), META long (-0.63), AAPL long, MSFT, SPY, QQQ (ADR% <1.2%)

**ADR% filter thresholds:**
- ≥1.5% → PASS (high-fuel zone)
- 1.2–1.5% → CAUTION (log warning, allow)
- <1.2% → SKIP (dead zone)

**NR sandbox results (Gemini):**
- AMZN: Sharpe 0.74 → 1.62 (+118%)
- PLTR: 1.04 → 1.79 (+72%)
- COIN: 1.12 → 1.86 (+66%)
- NVDA: 1.10 → 1.01 (slight decrease — exempt)

---

## Operational Setup (Unchanged)

```bash
./start.sh --tmux           # launch detached — survives terminal close
tmux attach -t nightwatcher  # reattach any time
```

Cron: `25 9 * * 1-5` — fires at 9:25 AM ET Mon–Fri
ORB scan: 10:30 AM ET (captures 9:30–10:30 range), polls every 5 min until noon cutoff, force-closes at 3:55 PM ET.

---

## Full Strategy Roster

| # | Strategy | Scans ET | Stop ET |
|---|---|---|---|
| 1 | `momentum-breakout` | 9:30, 10:30 AM | 3:30 PM |
| 2 | `orb` (v2) | 10:30 AM | 3:55 PM |
| 3 | `vwap-reversion` | 10:00–14:00 hourly | 3:30 PM |
| 4 | `gap-and-go` | 9:35 AM | — |
| 5 | `mean-reversion` | 10:30, 12:00, 13:30 | 3:30 PM |
| 6 | `futures-hedge` | 10:00 AM + 15-min poll | — |
| 7 | `options-momentum` | 9:30, 10:30 AM | — |

---

## Known Issues / Watch Points

- `options-momentum` silently skips until `options_enabled: true` set in policy
- `futures-hedge` short-selling requires margin enabled on paper account
- **ORB v2 first live day** — watch `logs/orb-activity.jsonl` for `FILTER` tagged lines to confirm ADR%/NR/Regime gates are firing correctly
- HOOD/PLTR included in watchlist but have Sharpe-PnL paradox (high Sharpe, near-zero absolute PnL) — monitor fill quality
- If Mac sleeps, tmux session pauses; use `caffeinate` if leaving overnight

---

## Blocked Items

- **Phase 1 / Phase 4b** — Waiting on Richard Kim's firm API credentials + REST spec
- Do not build institutional data layer or full SOR routing until spec arrives

---

## Next Session Options

- **Monitor ORB v2 first live session** — check `logs/orb-activity.jsonl` for filter pass rate; if 0 trades for 3+ days, tune `narrow_range.percentile_max` up to 0.6 or `adr.min_pct` down to 1.4
- **RVOL filter (v2 deferred)** — Gemini's planned "Super Filter": Narrow Range AND high relative volume at 09:45. Validate ADR+NR live for 2–4 weeks first
- **vwap-reversion threshold** — NVDA came 0.35% short of 1.5% threshold last session; consider tuning `deviation_pct` to 1.2%
- **Dashboard P&L per strategy** — aggregate fills from JSONL into per-strategy stats panel
- **Phase 4b** — unblocked when Richard's API spec arrives

---

## Partnership Context
Richard Kim — institutional HFT clearing firm, 2-3% US equity volume.
Blocked on API spec. Do not build what they already have.
See `Worked ON/V3_STANDARD_LANGUAGE.md` for V3 positioning language.
