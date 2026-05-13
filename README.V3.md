# NIGHTWATCHER V3
## The Universal Execution Layer

---

> *NightWatcher V3 — not the fastest system in the market, but the best-informed and cleanest-executing one a developer can build.*

---

## What This Is

NightWatcher V3 is a **standalone execution layer** — a universal interface between any algorithmic trading strategy and institutional-grade order execution.

It is not a strategy. It does not have opinions about what to buy or sell. It has one job: take a signal from any source and execute it with the highest possible quality — smart order routing, risk validation, slippage minimization, and a complete audit trail.

Any strategy plugs in. NightWatcher executes.

---

## The Problem It Solves

Most algorithmic traders build the same thing twice: a signal engine and an execution layer, wired together with brittle glue code. When they want to add a new strategy, they rebuild the execution plumbing. When they want better data, they rewrite the signal engine.

NightWatcher V3 separates these concerns completely.

The execution layer is the hard part — order routing, policy validation, slippage calculation, risk management, L2/L3 data access, dark pool connectivity, regulatory compliance, audit trail. Build it once, build it right, and expose it as a clean interface. Let strategy authors focus entirely on alpha generation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ALPHA SOURCES (any)                       │
│  Python scripts · JS strategies · LLM agents · External     │
│  systems · Webhooks · Manual signals · Third-party algos    │
└────────────────────────┬────────────────────────────────────┘
                         │  MCP (Model Context Protocol)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│               NIGHTWATCHER V3 — EXECUTION LAYER             │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Data Layer  │  │ Policy Engine│  │ Execution Engine  │  │
│  │             │  │              │  │                   │  │
│  │  L2 order   │  │  Kill switch │  │  TWAP / VWAP     │  │
│  │  book depth  │  │  Loss limits │  │  Smart order     │  │
│  │  Dark pool  │  │  Position    │  │  routing (SOR)   │  │
│  │  ATS prints  │  │  sizing      │  │  Slippage calc   │  │
│  │  SIP quotes  │  │  Risk rules  │  │  All asset types │  │
│  │  Options    │  │  Approval    │  │  Two-step HMAC   │  │
│  │  greeks     │  │  tokens      │  │  approval flow   │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
│                                                             │
│  Storage: D1 (audit) · KV (hot cache) · R2 (artifacts)     │
│  Runtime: Cloudflare Workers + Durable Objects (global)     │
└────────────────────────┬────────────────────────────────────┘
                         │  FIX / REST / dark pool routing
                         ▼
┌─────────────────────────────────────────────────────────────┐
│               INSTITUTIONAL EXECUTION VENUES                 │
│  14 exchanges · All ATS dark pools · Direct membership      │
│  No PFOF · No internalization · No information leakage      │
└─────────────────────────────────────────────────────────────┘
```

---

## The MCP Interface

NightWatcher exposes ~50 tools over the Model Context Protocol. Any system that can speak MCP can use NightWatcher as its execution backend — Python scripts, JavaScript runners, LLM agents, external platforms, or manual calls.

**Signal submission:**
```
signal-submit      — register a directional signal with confidence + rationale
signals-get        — retrieve current signal state for a symbol
signal-aggregate   — cross-signal consensus for a symbol
```

**Execution:**
```
orders-preview     — validate against policy, get HMAC approval token
orders-submit      — execute with token (equities, all order types)
options-order-preview  — validate options order against policy
options-order-submit   — execute options order with token
execution-twap     — TWAP slice schedule
execution-vwap     — VWAP benchmark execution
execution-sor-route    — smart order routing decision
execution-slippage-calc — implementation shortfall analysis
```

**Market data:**
```
prices-bars        — historical OHLCV (1Min → 1Day)
technicals-get     — RSI, MACD, SMA, Bollinger, ATR
quotes-batch       — real-time NBBO quotes
market-movers      — top gainers/losers/volume
options-chain      — full options chain with greeks
options-snapshot   — real-time contract pricing
regime-detect      — current market regime classification
```

**Risk:**
```
risk-kelly-size    — Kelly-optimal position sizing
risk-sharpe        — rolling Sharpe ratio
risk-var           — Value at Risk (historical simulation)
risk-correlation-check — portfolio correlation guard
risk-status        — full portfolio risk dashboard
```

---

## Supported Order Types

NightWatcher V3 executes across all major order and strategy types:

**Equities:**
- Market, limit, stop, stop-limit
- Long and short (with policy controls)
- TWAP and VWAP algorithmic slicing
- Smart order routing across venues

**Options:**
- Long calls and puts
- Covered calls
- Cash-secured puts
- Short calls and puts (naked, with policy controls)
- Spreads (bull call, bear put, iron condor — via multi-leg signals)

**Portfolio-level:**
- Hedge overlays (SPY short, sector hedges)
- Correlation-aware sizing
- Factor exposure management

---

## The Policy Engine

Every order — regardless of source — passes through the policy engine before execution. This is non-negotiable and cannot be bypassed.

Checks run on every order:
- Kill switch (immediate halt, all orders cancelled)
- Daily loss limit
- Loss cooldown (no trading after drawdown threshold)
- Market hours validation
- Symbol allow/deny lists
- Order type restrictions
- Notional per-order limit
- Position size as % of equity
- Maximum open positions
- Short-selling authorization
- Buying power verification

Options-specific checks:
- Options enabled flag
- DTE range (min/max days to expiration)
- Delta range validation
- Strategy type authorization (long call, long put, covered call, CSP, short call, short put)
- Per-position exposure limit
- Total options exposure as % of portfolio

The two-step flow is enforced at the infrastructure level:
1. `*-preview` → policy check → HMAC-signed approval token (5-min TTL, single-use)
2. `*-submit` → token verification → execution

No order reaches a venue without passing both steps.

---

## Data Infrastructure

**What's live:**
- Real-time equity quotes (SIP feed)
- Historical bars (1Min to 1Day, full lookback)
- Options chains with greeks (delta, gamma, theta, vega)
- Real-time options snapshots
- Market movers and breadth data
- SEC EDGAR event ingestion (cron, market hours)
- Technical indicator computation (RSI, MACD, SMA, ATR, Bollinger)
- Market regime detection (ADX, realized vol, SPY trend)

**Roadmap (pending institutional data partner):**
- L2 order book depth (bid/ask ladder, 10+ levels)
- L3 message stream (order-by-order book reconstruction)
- Dark pool / ATS print feed
- Direct exchange connectivity (14 exchanges, no PFOF)

The institutional data layer is gated on the partner API spec. The execution infrastructure is already built to consume it.

---

## Who This Is For

**Strategy authors** who want to focus on alpha generation and plug into a production-grade execution layer without building one.

**Quant developers** running multiple strategies who need a unified execution, risk, and audit system across all of them.

**AI/LLM trading agents** that need a structured, tool-based interface to markets with enforced risk controls — so the agent can act autonomously within defined limits.

**Institutional partners** who want to route client order flow through a modern, MCP-native execution client that connects to their clearing infrastructure.

---

## What NightWatcher V3 Is Not

NightWatcher V3 is not a high-frequency trading system in the co-location sense. True HFT operates at the microsecond level using C++, FPGAs, and servers racked physically adjacent to exchange matching engines — infrastructure that costs $20M+ to maintain. NightWatcher V3 operates at the millisecond-to-second scale, competing on information quality and execution discipline rather than raw speed. The edge is institutional-grade data access (L2 order book depth, dark pool prints, SIP-quality quotes) combined with smart order routing through direct exchange membership — capabilities most algorithmic traders at this level have never touched.

---

## Current Status

| Component | Status |
|---|---|
| MCP server (Cloudflare Workers + Durable Object) | ✅ Live |
| Policy engine (all order types) | ✅ Live |
| Two-step HMAC approval flow | ✅ Live |
| Equity execution (all order types) | ✅ Live |
| Options execution (long calls/puts) | ✅ Live |
| Options execution (short/covered/CSP) | 🔧 In progress |
| TWAP / VWAP / SOR execution algos | ✅ Live |
| Slippage and implementation shortfall | ✅ Live |
| Quant risk framework (Kelly, Sharpe, VaR) | ✅ Live |
| Market regime detection | ✅ Live |
| Technical indicators | ✅ Live |
| Real-time options chain + greeks | ✅ Live |
| Audit trail (D1) | ✅ Live |
| Dashboard (real-time monitoring) | ✅ Live |
| L2 / L3 order book data | 🔴 Pending partner API |
| Dark pool / ATS print feed | 🔴 Pending partner API |
| Direct exchange connectivity | 🔴 Pending partner API |
| Multi-strategy runner (7 strategies) | ✅ Live |
| Cron-based auto-launch | ✅ Live |

---

## Deployment

NightWatcher V3 runs on Cloudflare Workers — globally distributed, zero cold starts, stateful via Durable Objects. A single deployment serves any number of connected strategy clients simultaneously over MCP.

```bash
npm run deploy:production   # deploy to Cloudflare edge
./start.sh --tmux           # launch local stack (MCP + strategies)
```

---

*Built on Cloudflare Workers · Model Context Protocol · Alpaca Brokerage API*
*Designed for institutional execution partner integration*
