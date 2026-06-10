<div align="center">
  
  <br>
  
  # NIGHTWATCHER V3
  
  **Autonomous trading infrastructure for discretionary traders.**<br>
  Multi-agent research · Policy-gated execution · Institutional-grade quality.

  <br>
  
  `TypeScript` &nbsp;·&nbsp; `Cloudflare Workers` &nbsp;·&nbsp; `MCP Server` &nbsp;·&nbsp; `Alpaca Brokerage` &nbsp;·&nbsp; `Durable Objects`

  <br>
  
</div>

---

## What It Does

NIGHTWATCHER V3 is a self-hosted trading infrastructure that runs specialized LLM-powered agents to research equities, debate investment theses, enforce risk policy, and execute trades — all autonomously.

It mirrors how real trading firms operate: analysts gather data, researchers argue bull/bear cases, risk managers apply rules, and a trader executes through Alpaca. Every trade passes through a rule-based **policy engine** with 14 pre-trade checks and a two-step approval flow (preview → submit) before it ever hits the market.

**One command starts everything.** Seven strategies run on schedule. Results are stored locally in a D1 database.

---

## Quick Start

```bash
# 1. Clone, install
git clone https://github.com/YOUR-REPO/NIGHTWATCHER.git
cd NIGHTWATCHER
npm install

# 2. Configure (at minimum)
cp .env.example .dev.vars
# Edit .dev.vars — add your Alpaca API keys

# 3. Provision & run
wrangler d1 create nightwatcher-db        # Create D1 database
wrangler kv:namespace create CACHE         # Create KV namespace
# Paste the returned IDs into wrangler.toml
npm run db:migrate                        # Apply database schema
./start.sh                                # Start everything
```

That's it. The MCP server starts on port **8787**, the dashboard API on **3001**.

### What You Get

| Feature | Detail |
|---|---|
| **7 Live Strategies** | ORB, momentum-breakout, gap-and-go, mean-reversion, options-momentum, VWAP-reversion, VP-MACD |
| **Multi-Agent Research** | Analysts gather data → bull/bear researchers debate → risk team reviews → trader executes |
| **Policy Engine** | 14 pre-trade checks: kill switch, loss cooldown, daily loss limits, market hours, symbol lists, notional caps, position sizing, short restrictions, buying power |
| **Two-Step Execution** | `orders-preview` validates against policy and returns an HMAC approval token → `orders-submit` verifies the token then sends to Alpaca |
| **Three Signal Interfaces** | REST (`POST /api/signal`), WebSocket (`/stream`), MCP (`signal-submit` tool) — any strategy, any language |
| **Local-First** | All data stays local. D1 for persistence, KV for hot cache, R2 for artifacts. No cloud processing of your trades |
| **Paper Trading** | Set `ALPACA_PAPER=true` in `.dev.vars` to run risk-free before going live |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Signal Sources                      │
│  REST · WebSocket · MCP (LLM agents)             │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│           Policy Engine (14 checks)               │
│  Kill switch → Cooldown → Limits → Approval      │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│           Execution Layer                        │
│  Alpaca API · Two-step flow · Full audit trail    │
└─────────────────────────────────────────────────┘

Storage:  D1 (trades, signals, policy) · KV (cache) · R2 (artifacts)
Runtime: Cloudflare Workers + Durable Objects + KV + Scheduled Cron
```

### The Two-Step Flow

Every trade follows a mandatory two-step path enforced in code. No approval token, no execution.

1. **`orders-preview`** — validates against PolicyEngine (14 checks), generates HMAC-signed approval token (5-min TTL)
2. **`orders-submit`** — verifies token hasn't expired or been used, re-checks kill switch, then calls Alpaca

---

## The Strategies

| Strategy | Type | Window | Exit |
|---|---|---|---|
| **Opening Range Breakout (ORB)** | Long-only momentum | First 15–60 min of RTH | Stop at opposite range side / profit target |
| **Momentum Breakout** | Intraday momentum | Early session breakout | ADR% + volume confirmation |
| **Gap and Go** | Overnight gap capture | Pre-market gap → morning reaction | Close-of-session force exit |
| **Mean Reversion** | Range-bound markets | Extended move from VWAP | Return to mean / stop loss |
| **Options Momentum** | Long call/put options | Same as momentum, options legs | Delta-based or time-based exit |
| **VWAP Reversion** | Price vs volume-weighted average | Overbought/oversold from VWAP | Mean reversion target |
| **VP-MACD** | Volume-profiled MACD divergence | Intraday momentum shifts | MACD crossover + volume filter |

---

## Project Structure

```
NIGHTWATCHER/
├── src/                          # All source code (MCP server, dashboard API, strategies)
│    ├── mcp/                     # NightwatcherMcpAgent (~50 MCP tools)
│    ├── policy/                  # PolicyEngine + config
│    ├── signals/                 # Signal types + aggregator
│    ├── stream/                  # WebSocket handler
│    └── ...                      # Full source listing → see src/
├── strategies/                   # Strategy implementations (7 modules)
├── dashboard/                    # React-based monitoring frontend
├── migrations/                   # D1 database schema (12 migrations)
├── scripts/                      # Helper scripts (scan-now, run, etc.)
└── start.sh                      # One-command entry point
```

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ALPACA_PAPER` | `true` | Paper trading mode — **always use this first** |
| `KILL_SWITCH_SECRET` | `nightwatcher_kill_switch_secret_123` | HMAC secret for kill switch |
| `DEFAULT_MAX_NOTIONAL_PER_TRADE` | `$2,000` | Hard cap per order |
| `DEFAULT_MAX_POSITION_PCT` | `10%` | Max position as % of equity |
| `DEFAULT_COOLDOWN_MINUTES` | `30` | Pause after a loss |

See `.env.example` for the full variable list. All defaults are conservative — paper-trading safe.

---

## Development

```bash
npm run dev               # Local dev server (port 8787)
npm run build             # TypeScript compile
npm run typecheck         # Type-check only
npm run test              # Vitest (watch mode)
npm run db:migrate        # Apply D1 migrations locally
npm run deploy            # Deploy to Cloudflare dev env
```

---

## Who This Is For

- **Discretionary traders** who want systematic, rules-gated execution without building their own infrastructure
- **Quant researchers** prototyping strategies that need paper-trading validation before going live
- **Developers** exploring multi-agent systems and LLM-powered decision making in a real-world context

---

## Disclaimer

This software is for **educational and informational purposes only.** Nothing in this repository constitutes financial, investment, legal, or tax advice. All trading decisions are made at your own risk. Markets are volatile — you can lose some or all of your capital. The authors are not responsible for any financial losses resulting from use of this software. Always start with `ALPACA_PAPER=true` and never risk money you cannot afford to lose.

---

<sup>MIT License</sup>
