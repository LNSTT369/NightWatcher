# NIGHTWATCHER V3 — SESSION HANDOFF
**Date:** 2026-05-11
**Branch:** `NIGHTWATCHER-V3`
**Session type:** Planning + Architecture + Branch Setup

---

## Current Git State
```
Branch:  NIGHTWATCHER-V3 (branched from main @ 123a78b)
Remote:  not yet pushed
Status:  clean working tree — nothing to commit
```

---

## Session Goals
This was a planning and foundation session, not a build session. Goals were:
1. Analyze the Richard Kim transcript and Gemini roadmap
2. Produce a master plan that correctly repositions V3
3. Draw the full system architecture
4. Establish the NIGHTWATCHER-V3 branch cleanly
5. Set V3 documentation and language standards

All goals completed.

---

## Files Created This Session

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Codebase guide for Claude Code — commands, architecture, key patterns |
| `Worked ON/NIGHTWATCHER_V3_MASTER_PLAN.md` | Full phased V3 build plan (5 phases, ~25 weeks) |
| `Worked ON/NIGHTWATCHER_V3_ARCHITECTURE.md` | Complete ASCII system architecture diagram |
| `Worked ON/V3_STANDARD_LANGUAGE.md` | Required positioning disclaimer for all V3 docs |
| `HANDOFF.md` | This file |

**Files modified:**
| File | Change |
|------|--------|
| `wrangler.toml` | `FEATURE_LLM_RESEARCH` flipped `"false"` → `"true"` |

**Files deleted:**
| File | Reason |
|------|--------|
| `agent-ai.mjs` | Superseded by `src/mcp/agent.ts` Durable Object |

---

## Key Decisions Made This Session

### 1. V3 Strategic Repositioning
NightWatcher V3 is NOT a pure HFT system. It is the best-informed,
cleanest-executing algorithmic trading layer a developer can build.
The edge is information quality (L2, dark pool, institutional data) and
execution discipline — not raw microsecond speed.
**This language must appear in all V3 documentation. See `Worked ON/V3_STANDARD_LANGUAGE.md`.**

### 2. NightWatcher Does NOT Build Its Own FIX Layer
Richard Kim's firm IS the institutional execution infrastructure.
They are direct members of 14 exchanges and all dark pools (agency execution,
no PFOF). NightWatcher connects to their REST API. They translate to FIX.
We do not implement FIX or binary protocols ourselves.

### 3. The Alpha Signal Contract
Every signal source must emit a typed `AlphaSignal` interface:
`signal_id · source · symbol · direction · confidence · urgency · horizon · ttl_seconds`
This is the architectural centerpiece of V3 — the "empty slot" for pluggable alpha.
File to create: `src/signals/types.ts`

### 4. StockTwits Is Removed as a Primary Trigger
Social sentiment is a lagging indicator. It becomes a supplemental enrichment
tool only, callable on-demand. No trade is triggered by social sentiment alone.

### 5. Commit Strategy
Always commit planning docs to `main` first, then branch.
`NIGHTWATCHER-V3` branched from `main @ 123a78b` with all planning docs included.

---

## Current System State (V2 baseline on this branch)

**What is working (inherited from V2):**
- Full MCP agent (`src/mcp/agent.ts`) with ~50 tools across 14 categories
- Two-step HMAC approval token order flow (orders-preview → orders-submit)
- Policy engine with static risk limits (`src/policy/engine.ts`)
- Alpaca trading + market data providers (`src/providers/alpaca/`)
- Pluggable LLM: OpenAI, Gemini, Ollama (`src/providers/llm/`)
- D1, KV, R2 storage clients
- SEC EDGAR news polling
- Technical indicators (SMA, RSI, MACD, Bollinger) + signal detection
- Options support (chain, preview, submit)
- Trade journal / memory system

**What does NOT exist yet (V3 build targets):**
- `AlphaSignal` interface and aggregator
- Regime detection engine
- WebSocket streaming endpoint
- L2 order book tools
- Dark pool print ingestion
- Smart Order Router
- Quant risk engine (Sharpe, VaR, factor exposure, Kelly sizing)
- Execution provider abstraction
- Institutional data client (replacing Alpaca market data)
- Execution quality analytics
- Futures hedging tools

---

## Partnership Context
**Richard Kim** — former VP at Alpaca, now at an institutional HFT clearing firm.
His firm processes 2-3% of total US equity market volume, 0 outages in 2024.
Direct member of 14 exchanges + all dark pools. Building a "Master MCP layer"
aggregating Polygon SIP data, Benzinga news, FMP analyst data, L2/L3.
They want to plug their alpha generation tool's signals into NightWatcher.
**They are the execution partner for V3. Do not build what they already have.**

---

## Exact Next Step — Phase 0, Task 1

**Start here next session:**

Create `src/signals/types.ts` — the `AlphaSignal` interface.

```typescript
// src/signals/types.ts

export type SignalDirection = "long" | "short" | "neutral";
export type SignalUrgency = "immediate" | "session" | "swing";
export type SignalSource =
  | "llm"
  | "technical"
  | "l2_microstructure"
  | "dark_pool"
  | "external"
  | "manual";

export interface AlphaSignal {
  signal_id: string;
  source: SignalSource;
  generated_at: string;
  ttl_seconds: number;

  symbol: string;
  asset_class: "equity" | "option" | "future";
  direction: SignalDirection;
  confidence: number;       // 0.0 → 1.0
  urgency: SignalUrgency;
  horizon: number;          // expected hold in minutes

  suggested_notional?: number;
  suggested_pct_equity?: number;

  rationale: string;
  regime_tags: string[];
  supporting_data: Record<string, unknown>;
}

export interface AggregatedSignal {
  aggregated_id: string;
  symbol: string;
  final_direction: SignalDirection;
  final_confidence: number;
  source_count: number;
  conflict_detected: boolean;
  contributing_signals: AlphaSignal[];
  created_at: string;
}
```

After that, create `src/signals/aggregator.ts` with the weighting formula:
```
score = Σ (confidence_i × freshness_decay_i × source_weight_i)
freshness_decay = exp(-elapsed_seconds / ttl_seconds)
```

Source weights (configurable, default values):
- `dark_pool`: 0.9
- `l2_microstructure`: 0.8
- `technical`: 0.6
- `llm`: 0.4
- `external`: configurable per counterparty
- `manual`: user-specified, capped at 0.95

Then add D1 migration `0004_alpha_signals.sql` for persisting signals.

---

## Phase 0 Remaining Tasks (after signals interface)
1. ✅ Define `AlphaSignal` interface (`src/signals/types.ts`)
2. Build `AlphaSignal` aggregator (`src/signals/aggregator.ts`)
3. Add WebSocket `/stream` endpoint in `src/index.ts`
4. Add temporal decay to all KV cached data
5. Add execution quality logging to D1 (`src/storage/d1/queries/execution_fills.ts`)
6. Remove StockTwits as cron trigger in `src/jobs/cron.ts`
7. Add migration `0004_alpha_signals.sql`

---

## Open Questions / Blockers
- **API access from Richard's firm** — Phase 1 (institutional data integration)
  cannot start until we have credentials for their Master MCP layer.
  Phase 0 can proceed without this.
- **Execution venue API** — Phase 4 requires their REST API spec.
  Build the abstraction layer now; fill in the client when spec arrives.
- **Futures API** — Phase 5. Not a current blocker.

---

## V3 Phase Timeline (reference)
| Phase | Scope | Est. Duration |
|-------|-------|---------------|
| 0 | Foundation hardening (signals, WebSocket, decay) | 1-2 weeks |
| 1 | Institutional data integration (L2, dark pool, news) | 2-3 weeks |
| 2 | Regime engine + alpha signal aggregator | 3-4 weeks |
| 3 | Quant risk framework (Sharpe, VaR, Kelly, factor) | 3-4 weeks |
| 4 | Smart execution (SOR, algos, dark pool routing) | 4-6 weeks |
| 5 | Multi-asset (futures hedging, options upgrade) | 4-6 weeks |
