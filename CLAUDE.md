# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

NIGHTWATCHER V2 is a Cloudflare Workers MCP (Model Context Protocol) server for autonomous stock trading via the Alpaca brokerage API. It runs as a Durable Object, exposes ~50 MCP tools to an LLM client, and enforces a rule-based policy engine before any order can execute.

## Commands

```bash
npm run dev              # Local dev server (wrangler dev, port 8787)
npm run build            # TypeScript compile
npm run typecheck        # Type-check without emitting
npm run lint             # ESLint on src/
npm run test             # Vitest (watch)
npm run test:run         # Vitest (single run, for CI)
npm run deploy           # Deploy to Cloudflare (development env)
npm run deploy:production # Deploy to Cloudflare (production env)
npm run db:migrate       # Apply D1 migrations locally
npm run db:migrate:remote # Apply D1 migrations to remote D1
```

## First-Time Setup

1. Copy `.env.example` → `.dev.vars` and fill in values
2. Required secrets: `ALPACA_API_KEY`, `ALPACA_API_SECRET`, `KILL_SWITCH_SECRET`
3. Set `ALPACA_PAPER=true` unless trading real money
4. Create Cloudflare resources and update `wrangler.toml` with real IDs:
   - `wrangler d1 create nightwatcher-db`
   - `wrangler kv:namespace create CACHE`
5. Run `npm run db:migrate` to apply the three schema migrations

## Architecture

### Request Flow

`src/index.ts` routes all `/mcp` requests to the `NightwatcherMcpAgent` Durable Object. The worker also handles cron scheduled events via `src/jobs/cron.ts`.

### MCP Agent (`src/mcp/agent.ts`)

`NightwatcherMcpAgent` extends `McpAgent<Env>` from the `agents` package. Its `init()` method:
1. Loads the policy config from D1 (falls back to env-var defaults)
2. Auto-selects an LLM provider based on `LLM_PROVIDER` env var (OpenAI > Gemini > Ollama auto-detection fallback)
3. Registers all MCP tool groups

Tool groups: `Auth`, `Account`, `Positions`, `Orders`, `Risk`, `Memory`, `Market Data`, `Technicals`, `Events`, `News`, `Research`, `Options`, `Utility`. Use `catalog-list` tool for the full inventory.

### Order Execution Flow (critical path)

Every trade follows a mandatory two-step flow enforced in code:
1. **`orders-preview`** → validates against `PolicyEngine`, generates an HMAC-signed approval token (default 5-min TTL, stored in D1)
2. **`orders-submit`** → verifies token hasn't expired/been used, re-checks kill switch, then calls Alpaca

The `PolicyEngine` (`src/policy/engine.ts`) checks: kill switch, loss cooldown, daily loss limit, market hours, symbol allow/deny lists, order type restrictions, notional limit, position size % of equity, max open positions, short-selling restrictions, and buying power.

Options orders use the same two-step flow (`options-order-preview` / `options-order-submit`) with additional DTE, delta, strategy, and exposure checks.

### Storage

- **D1** (`src/storage/d1/`): Relational — trades, tool logs, approvals, journal/memory, events, policy config, risk state. Queries are organized per-table under `queries/`.
- **KV** (`src/storage/kv/`): Hot cache (fast reads for frequently accessed data).
- **R2** (`src/storage/r2/`): Artifact storage.

### Policy Config

`PolicyConfig` (`src/policy/config.ts`) defaults are read from `wrangler.toml` `[vars]` at startup. Overrides can be stored in D1 (loaded via `getPolicyConfig`). Options trading is disabled by default (`options_enabled: false`).

### LLM Provider

Set `LLM_PROVIDER` to `"openai"`, `"gemini"`, or `"ollama"`. Enabled by `FEATURE_LLM_RESEARCH=true`. Required for: `events-classify`, `memory-summarize`, `symbol-research`, `llm-prompt`, `symbol-analyze`. If no LLM is configured these tools return `NOT_SUPPORTED`.

### Cron Jobs (`src/jobs/cron.ts`)

| Schedule | Task |
|---|---|
| `*/5 13-20 * * 1-5` | Event ingestion from SEC EDGAR (market hours only) |
| `0 14 * * 1-5` | Market open prep (cleanup expired approvals) |
| `30 21 * * 1-5` | Market close cleanup |
| `0 5 * * *` | Midnight reset (daily loss counter) |
| `0 * * * *` | Hourly cache refresh (stub) |

### Tool Response Convention

All MCP tool handlers return `{ content: [{ type: "text", text: JSON.stringify(result) }] }` where `result` is either `success(data)` or `failure({ code: ErrorCode, message: string })` from `src/mcp/types.ts`. Error responses also set `isError: true`.

### Kill Switch

`kill-switch-enable` cancels all open orders immediately and blocks all future orders. `kill-switch-disable` requires the string `"CONFIRM_RESUME_TRADING"` plus a valid HMAC of `"DISABLE_KILL_SWITCH"` signed with `KILL_SWITCH_SECRET`.
