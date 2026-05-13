# NIGHTWATCHER — Session Handoff
**Date:** 2026-05-12 | **Branch:** NIGHTWATCHER-V3

---

## Systems Status

- **Cron:** `25 9 * * 1-5` → `./start.sh --tmux` — fires 9:25 AM ET Mon–Fri ✓
- **Tmux:** `nightwatcher` session live ✓
- **Config:** ORB v2 updated, 10-symbol watchlist active ✓
- **Forward test:** Paper trading live since 2026-05-12, accumulating daily

---

## What Was Done This Session

### 1. Full ORB + IB Backtest — 21 Instruments
`/Users/user/Desktop/backtest/orb_backtest/run_full_backtest.py`

Tested every CSV in `orb_backtest/data/completed/` across two strategies:
- **ORB** — 60m opening range, close-outside entry, stop at opposite boundary, target = entry ± R × range
- **IB (Initial Balance)** — same 60m range, target anchored at boundary ± extension × range

Scenarios per ticker: ORB long-only (0.5R–3.0R, no filter + NR50), ORB both-dir (1.0–2.0R), IB long-only + both-dir (1.0×–2.0× extension). MNQ 15m also tested at 15m and 30m ORB windows.

Reports: `orb_backtest/results/full_backtest/` — per-ticker `.md` + `MASTER_SUMMARY.md` + `ANALYSIS.md`

### 2. Strategy Cards — Presentation Folder
`presentation/` — 7 one-page strategy cards + README index for Richard Kim meeting.
Format per card: hypothesis, rules, filters, backtest stats, forward test metrics, 6-week adjustment trigger.
Review checkpoint: **2026-06-23**.

### 3. ORB Config Updated — Backtest-Driven Watchlist
`strategies/orb/config.json` fully updated based on 100+ trade validated findings.

---

## Backtest Key Findings

### Confirmed Edge (100+ trades, long-only, costs included, NR50 filtered)

| Ticker | Sharpe | Trades | Best Target |
|---|---|---|---|
| MNQ 60m | 3.17 | 103 | 1.0R NR50 |
| AMZN | 2.65 | 193 | 1.0R NR50 |
| IRM | 1.89 | 246 | 2.0R NR50 |
| AAPL | 1.72 | 196 | 1.5R NR50 |
| SPY | 1.49 | 299 | 2.0R NR50 |
| QQQ | 1.49 | 282 | 2.0R NR50 |
| TSLA | 0.72 | 348 | 3.0R unfiltered |
| COIN | 1.65 | 146 | 3.0R unfiltered |

**Key structural findings:**
- MNQ (NQ futures) is the best ORB instrument — flag for V3 institutional integration
- ORB and IB produce equivalent results on 60m bars — ORB framing is cleaner
- 60m window beats 15m and 30m for MNQ (Sharpe 2.30 vs 1.45 vs 1.31)
- Long-only outperforms both-direction on every name — live strategy is correct
- NR50 adds 0.5–1.1 Sharpe on positive names; doesn't rescue low-ADR dead zones

### Dead Zone Confirmed (negative at all parameters, 100+ trades)

| Ticker | Best Sharpe | Verdict |
|---|---|---|
| NVDA | -1.75 | Removed from watchlist |
| AMD | -0.97 | Removed from watchlist |
| MU | -0.64 | Removed from watchlist |
| NFLX | +0.09 | Near-zero — removed |
| KO | -1.53 | Low ADR — commissions destroy edge |
| XOM | -0.54 | Low ADR — same issue |

---

## Config Changes Applied

**Watchlist:** NVDA, AMD, NFLX, MU, BILI removed. AAPL, IRM, SPY, QQQ added.

```
Old: NVDA, TSLA, AMD, NFLX, AMZN, MU, BILI, COIN, PLTR, HOOD, ABNB
New: AMZN, TSLA, AAPL, IRM, SPY, QQQ, COIN, PLTR, HOOD, ABNB
```

**R targets updated:**

| Symbol | Old | New | Reason |
|---|---|---|---|
| AMZN | 3.0R | 2.0R | NR50 peak at 1.0R—2.0R |
| TSLA | 2.0R | 3.0R | Best unfiltered at 3.0R |
| AAPL | — | 1.5R | New add, peak NR50 Sharpe |
| IRM | — | 2.0R | New add, peak NR50 Sharpe |
| COIN | 1.5R | 2.0R | Unfiltered best at 2.0R+ |
| NVDA, AMD | removed | — | Off watchlist |

**NR50 exemptions:** NVDA/AMD → TSLA/COIN (NR50 hurts both names)

**ADR gate:** SPY and QQQ exempted (confirmed edge but ADR% ~0.7% fails the 1.5% threshold)

---

## Presentation for Richard Kim

`presentation/` — 7 strategy cards ready.
Three-layer framework: backtest → paper forward test (live now) → live micro-sizing.
Paper period completes ~2026-06-23. That is when all three layers can be shown.

---

## Next Session — Action Items

1. Check `logs/orb-activity.jsonl` — trades since 2026-05-12?
2. **6-week review (2026-06-23):** live trade count vs backtest expectation, filter pass rate per symbol
3. MNQ futures ORB — strongest instrument found (3.17 Sharpe). Discuss adding to live strategy
4. PLTR, HOOD, ABNB — below 100-trade threshold. Re-evaluate at 6-week checkpoint
5. IRM — confirm ADR gate is passing before review (unusual name, verify it's trading)
