```
================================================================================
NIGHTWATCHER V3: MASTER EXECUTION LAYER PLAN
A Multi-Agent Quant Hedge Fund Engineering Perspective
Author: Claude (Senior Execution Eng. / Quant Infra)
Reviewed Against: Richard Kim Transcript + Gemini V3 Roadmap
================================================================================

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTIVE DIAGNOSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The Gemini roadmap is architecturally correct in direction but operationally
thin. It names the four right problems but does not specify HOW to solve any of
them. It also makes one strategic error: it assumes NightWatcher should become
its own FIX/binary execution infrastructure. That is the wrong mountain to climb.

The Richard Kim conversation reveals a far smarter path: Richard's firm IS that
infrastructure. They clear 2-3% of total US equity market volume, process 41T
shares with zero outages, and are direct members of 14 exchanges and all dark
pools. NightWatcher should CONSUME their stack, not replicate it.

The correct V3 thesis is:

  NightWatcher = Alpha Signal Orchestrator + Smart Validator + Institutional
                 Execution Client

NOT: NightWatcher = its own exchange-connected execution engine.

The Raptor 3 philosophy applies perfectly here: one clean coil controlling
all fuel flow. V3 should be sleek, purposeful, and modular enough that any
alpha source can be plugged in one end and any institutional execution
venue is accessible on the other.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT V2 GOT RIGHT (DO NOT DISCARD)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  - Cloudflare Workers as the execution backbone is correct. Edge compute with
    Durable Objects is the right architecture for a stateful MCP agent.
    Richard confirmed this: "Cloudflare Worker is definitely the infrastructure
    to look at for high performance trading."

  - The two-step approval flow (preview → HMAC token → submit) is sound
    institutional design. Keep it. Harden it.

  - The MCP tool surface area is well-structured. 50 tools is not too many;
    it is the right abstraction layer for an LLM-driven trading agent.

  - D1 for audit trail, KV for hot cache, R2 for artifacts is exactly right.

  - The pluggable LLM provider (OpenAI/Gemini/Ollama) is the right pattern.
    Extend it, do not replace it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT V2 GOT WRONG (ROOT CAUSE ANALYSIS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  PROBLEM 1: Social Sentiment is a Lagging Indicator
  ───────────────────────────────────────────────────
  StockTwits data is already priced in before it hits NightWatcher.
  The 30-second cron loop is 30 seconds too slow. The moment retail Twitter
  discusses a ticker, market makers with L2/L3 feeds have already repositioned.
  Sentiment should become ONE downstream signal source, not the trigger.

  PROBLEM 2: Alpaca as Execution Venue Will Create a Ceiling
  ──────────────────────────────────────────────────────────
  Alpaca internalizes flow (PFOF model). As NightWatcher becomes more
  sophisticated, orders will be flagged as "toxic flow" — professional
  algorithmic flow that market makers reject. Richard explicitly confirmed this.
  Every algo trader eventually hits this ceiling and migrates away from Alpaca.
  V3 should plan the migration path now rather than discover it later.

  PROBLEM 3: No Alpha/Execution Separation
  ─────────────────────────────────────────
  The current architecture tightly couples the signal source (StockTwits) to
  the execution path. There is no clean interface between alpha generation and
  trade execution. This makes it impossible to swap signal sources or run
  multiple concurrent strategies.

  PROBLEM 4: Risk is Rule-Based, Not Model-Based
  ────────────────────────────────────────────────
  The policy engine validates against static limits (notional, % equity, etc.).
  This is necessary but not sufficient. It does not account for portfolio-level
  factor exposure, correlation, volatility regime, or drawdown dynamics.
  A 2% position limit means nothing if 8 of your 10 positions are all correlated
  to the same beta factor.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
V3 ARCHITECTURE OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌─────────────────────────────────────────────────────────────────┐
  │                    NIGHTWATCHER V3 SYSTEM                       │
  │                                                                 │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │                  SIGNAL LAYER                             │   │
  │  │                                                           │   │
  │  │  [LLM Alpha]  [Technical]  [L2 Microstructure]           │   │
  │  │  [Regime]     [External]   [Quant Models]                 │   │
  │  │         ↓           ↓              ↓                      │   │
  │  │         └───────────┴──────────────┘                      │   │
  │  │                     ↓                                     │   │
  │  │           [ Alpha Signal Aggregator ]                     │   │
  │  │           direction · confidence · urgency · horizon      │   │
  │  └──────────────────────────────────────────────────────────┘   │
  │                           ↓                                     │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │              VALIDATION LAYER (enhanced)                  │   │
  │  │                                                           │   │
  │  │  [ Policy Engine ]  [ Quant Risk Engine ]                 │   │
  │  │  kill switch        Sharpe / Sortino                      │   │
  │  │  daily loss         Factor exposure (Fama-French)         │   │
  │  │  notional limits    Portfolio VaR / CVaR                  │   │
  │  │  position sizing    Regime-adjusted budgets               │   │
  │  │  market hours       Correlation concentration             │   │
  │  │         ↓                      ↓                          │   │
  │  │         └──────────────────────┘                          │   │
  │  │              APPROVAL TOKEN (HMAC, TTL=300s)              │   │
  │  └──────────────────────────────────────────────────────────┘   │
  │                           ↓                                     │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │                  EXECUTION LAYER                          │   │
  │  │                                                           │   │
  │  │  [ Smart Order Router ]                                   │   │
  │  │    liquidity check before placing                         │   │
  │  │    venue selection (dark pool / lit / ATS)                │   │
  │  │    algo selection (market / VWAP / TWAP / iceberg)        │   │
  │  │         ↓                                                 │   │
  │  │  [ Agency Execution Venue ]   [ Alpaca (paper only) ]     │   │
  │  │    Richard's firm REST API                                │   │
  │  │    Direct exchange member                                 │   │
  │  │    All dark pools                                         │   │
  │  └──────────────────────────────────────────────────────────┘   │
  │                           ↓                                     │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │                   DATA LAYER                              │   │
  │  │                                                           │   │
  │  │  [ Master MCP ] (Richard's firm aggregation layer)        │   │
  │  │    Polygon SIP-quality quotes (via redistribution)        │   │
  │  │    Level 2 order book depth (bid/ask stacks)              │   │
  │  │    Level 3 dark pool prints (ATS reported trades)         │   │
  │  │    Benzinga news (real-time)                              │   │
  │  │    FMP analyst reports                                     │   │
  │  │    13F / SEC filings (EDGAR)                              │   │
  │  └──────────────────────────────────────────────────────────┘   │
  │                                                                 │
  │  PERSISTENCE: D1 (audit) · KV (hot state) · R2 (artifacts)     │
  │  RUNTIME: Cloudflare Workers + Durable Objects                  │
  │  INTERFACE: MCP Server (NightwatcherMcpAgent)                   │
  └─────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE ALPHA SIGNAL CONTRACT (Core Design Decision)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every signal source — LLM, technical, L2 microstructure, external quant model,
or Richard's firm's alpha generation tool — must produce exactly this shape:

  interface AlphaSignal {
    // Identity
    signal_id:       string;    // UUID
    source:          string;    // "llm" | "technical" | "l2" | "external" | ...
    generated_at:    string;    // ISO timestamp
    ttl_seconds:     number;    // how long this signal is valid before stale

    // Core
    symbol:          string;    // "AAPL" or "AAPL241220C00200000" for options
    asset_class:     string;    // "equity" | "option" | "future"
    direction:       "long" | "short" | "neutral";
    confidence:      number;    // 0.0 → 1.0
    urgency:         "immediate" | "session" | "swing"; // execution horizon
    horizon:         number;    // expected hold in minutes

    // Sizing hint (optional — overridden by risk engine)
    suggested_notional?: number;
    suggested_pct_equity?: number;

    // Supporting evidence
    rationale:       string;
    regime_tags:     string[];  // ["trending", "high_vol", "risk_off"]
    supporting_data: Record<string, unknown>; // technicals, news, L2 snapshot
  }

This is the "empty slot" from the conversation. Any alpha source speaks this
language. NightWatcher's job is to receive it, validate it, size it properly,
and execute it with institutional quality.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 0: FOUNDATION HARDENING (Do First, Before Any New Feature)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Estimated scope: 1-2 weeks of development

  0.1  REMOVE STOCKTWITS AS A PRIMARY TRIGGER
       StockTwits should not be a cron trigger. Retain it only as a supplemental
       sentiment enrichment tool callable on-demand. The system must not make
       any trade based solely on social sentiment.

  0.2  DEFINE THE ALPHA SIGNAL INTERFACE
       Create src/signals/types.ts with the AlphaSignal interface above.
       Every existing signal path (LLM classifier, technical, events) must
       be refactored to emit AlphaSignal instead of ad-hoc data blobs.

  0.3  BUILD THE SIGNAL AGGREGATOR
       src/signals/aggregator.ts
       Takes N concurrent AlphaSignals for the same symbol, weights them by
       source confidence and temporal freshness, and emits a single
       AggregatedSignal. This prevents conflicting signals from triggering
       contradictory orders.

       Weighting formula:
         score = Σ (confidence_i × freshness_decay_i × source_weight_i)
         freshness_decay = exp(-elapsed_seconds / ttl_seconds)

  0.4  TEMPORAL DECAY ON ALL DATA
       (Directly from the conversation — this is the right idea.)
       Any cached market data, news item, or signal older than its TTL must
       be weighted down or rejected entirely. Implement a freshness score on
       every data record in KV and D1. LLM classifiers must be told
       "this news is 4 hours old" so they recency-weight appropriately.

  0.5  WEBSOCKET STREAMING SUPPORT
       Cloudflare Workers supports WebSocket upgrades. Add a /ws endpoint
       on the Worker for streaming L2 data from the data provider. This
       replaces the 30-second cron polling model with event-driven ingestion.
       Market events push in; signals are computed immediately.

  0.6  EXECUTION QUALITY BASELINE
       Before migrating execution venues, instrument every order fill with:
         - slippage_bps = (fill_price - expected_price) / expected_price × 10000
         - fill_latency_ms
         - partial_fill_pct
       Log these to D1. This creates the baseline against which V3
       execution improvements will be measured.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1: INSTITUTIONAL DATA INTEGRATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Prerequisite: Partnership/API access from Richard's firm's Master MCP layer.
Estimated scope: 2-3 weeks

  1.1  CONNECT TO MASTER MCP LAYER
       Replace Alpaca market data with the institutional feed through
       Richard's redistribution agreements:
         - Polygon SIP feed → real NBBO quotes (sub-100ms vs. Alpaca's seconds)
         - Benzinga → real-time news with symbol tags pre-extracted
         - FMP → analyst ratings, EPS estimates, target price changes

       Create src/providers/institutional/client.ts as the unified client.
       Mirror the existing Alpaca provider interface so MCP tools don't change.

  1.2  LEVEL 2 ORDER BOOK INTEGRATION
       L2 data provides bid/ask depth at each price level (not just NBBO).
       New MCP tools to expose:
         - orderbook-snapshot: top N levels of bid/ask stack for a symbol
         - orderbook-imbalance: ratio of bid size to ask size (directional pressure)
         - spread-compression: is the spread narrowing (institutional buying) or
                               widening (risk-off, avoid entry)?

       Orderbook imbalance is a leading indicator. If bid depth is 3x ask depth
       at the inside price, there is buying pressure. This is the opposite of
       social sentiment: it reflects what informed participants are DOING,
       not what retail is SAYING.

  1.3  LEVEL 3 / DARK POOL PRINT DETECTION
       L3 / ATS (Alternative Trading System) data reports dark pool trades
       after execution. A dark pool print above average dark share for a
       symbol (typically >40%) signals institutional accumulation.
       New signal source: "dark_pool" feeding into AlphaSignal.

       Dark pool signals have the highest confidence weight in the aggregator
       because they represent what funds with information are actually doing.

  1.4  SEC EDGAR STREAMING
       The existing SEC EDGAR provider polls. Upgrade to streaming:
       EDGAR publishes an ATOM feed that updates within seconds of a filing.
       8-K filings (material events) are the highest-value signal.
       Form 4 (insider buy/sell) is the second highest.
       Classify these immediately via LLM on ingestion.

  1.5  NEWS VELOCITY SIGNAL
       Do not just classify news. Measure its velocity:
         news_velocity = article_count_last_5min / article_count_last_60min
       If velocity spikes (10x), something material is breaking.
       This becomes an urgency multiplier on the LLM-classified signal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2: REGIME-AWARE ALPHA ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Estimated scope: 3-4 weeks

  2.1  REGIME DETECTION ENGINE
       (Richard directly mentioned this: "there are certain models we call
       regimes in quantitative finance.")

       Regime classifies the current market environment. Strategies that work
       in one regime fail catastrophically in another. This is why a trading
       system without regime awareness produces inconsistent results.

       src/regime/detector.ts

       Regime dimensions to track:
         VOLATILITY:   low (VIX < 15) | normal (15-25) | high (25-40) | crisis (>40)
         TREND:        strong_up | weak_up | sideways | weak_down | strong_down
         CORRELATION:  normal | risk_on (low corr) | risk_off (high corr / flight)
         MACRO:        rate_rising | rate_stable | rate_falling
         LIQUIDITY:    ample | constrained | seized (bid-ask spreads 3x+ normal)

       Implementation using available data:
         - VIX proxy: 30-day realized vol of SPY vs. implied vol from options chain
         - Trend: 20/50/200 day SMA relationship (already in technicals engine)
         - Correlation: rolling 20-day correlation of portfolio holdings to SPY
         - Macro: derived from Fed event calendar + rate curve slope (2s10s)
         - Liquidity: average spread across top 20 holdings vs. 30-day baseline

       Current regime is cached in KV with 5-minute TTL.
       All risk budgets, signal confidence, and position sizing are
       conditioned on the current regime.

  2.2  REGIME-CONDITIONAL SIGNAL ROUTING
       Not all signals are valid in all regimes.

         Example routing rules (configurable in D1, not hardcoded):
         ┌─────────────────────────┬────────────────────────────────────────┐
         │ Regime                  │ Active Signal Sources                  │
         ├─────────────────────────┼────────────────────────────────────────┤
         │ Trending + Low Vol      │ Technical momentum, L2 imbalance       │
         │ Sideways + Low Vol      │ Mean-reversion, options premium capture │
         │ High Vol + Risk-Off     │ Dark pool prints only (informed flow)  │
         │ Crisis                  │ KILL SWITCH ENABLED, hedge only        │
         │ Trending + High Vol     │ Momentum with tighter stops (50% size) │
         └─────────────────────────┴────────────────────────────────────────┘

  2.3  MULTI-SOURCE ALPHA SIGNALS (the plug-and-play interface)
       Signal sources registered in V3:

       A. LLM Research Signal (existing, upgraded)
          Input: news, SEC filings, earnings data
          Model: existing classifier → structured output in AlphaSignal format
          Confidence weight: 0.4 (useful for swing/overnight, poor for intraday)

       B. Technical Momentum Signal (existing, upgraded)
          Input: price bars from institutional feed (L1)
          Logic: existing computeTechnicals → detectSignals
          Upgrade: add volume profile analysis, VWAP deviation, sector momentum
          Confidence weight: 0.6 (valid for intraday session trades)

       C. L2 Microstructure Signal (new — Phase 1 prerequisite)
          Input: real-time order book from L2 feed
          Logic: bid/ask imbalance, trade print size classification, sweep detection
          Confidence weight: 0.8 (most actionable for same-day entries)
          Urgency: always "immediate" — stale within 60 seconds

       D. Dark Pool Accumulation Signal (new — Phase 1 prerequisite)
          Input: ATS/dark pool print tape
          Logic: dark pool share > threshold AND print direction aligns
          Confidence weight: 0.9 (informed institutional flow)
          Urgency: "session" — valid same day but not tick-level

       E. External Alpha Signal (new — Richard's firm's alpha tool)
          Input: HTTP webhook or MCP tool call from Richard's platform
          Format: AlphaSignal directly (they format to our spec)
          Confidence weight: configurable per counterparty

       F. Manual Override Signal (existing MCP tool, upgraded)
          Human-submitted via MCP tool with reasoning required
          Confidence: user-specified, capped at 0.95

  2.4  SIGNAL ENSEMBLE AND CONFLICT RESOLUTION
       When multiple signals exist for the same symbol:
         - Same direction: combine confidence scores (capped at 0.95)
         - Conflicting direction: emit NEUTRAL, log disagreement, no trade
         - One signal only: pass through with source-weighted confidence
         - Any CRISIS regime signal: override all → exit positions, halt entries

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 3: QUANTITATIVE RISK FRAMEWORK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Estimated scope: 3-4 weeks
(This replaces the V2 concept of "static policy limits" with live quant models.)

  3.1  REAL-TIME PORTFOLIO RISK METRICS
       Computed on every orders-preview call, cached in KV (1-min TTL):

       Sharpe Ratio (rolling 30-day):
         sharpe = (annualized_return - risk_free_rate) / annualized_std_dev
         Threshold: if rolling Sharpe < 0.5, reduce all new position sizes by 50%.
         If Sharpe < 0, halt new longs, only allow hedges and exits.

       Sortino Ratio (downside deviation only):
         sortino = (annualized_return - risk_free_rate) / downside_std_dev
         More sensitive than Sharpe to drawdown periods. Use as secondary check.

       Max Drawdown (rolling 90-day):
         If current drawdown > 50% of max historical drawdown, enter
         "drawdown protection mode": size all new entries at 25% normal.

       Value at Risk (VaR 95%, 1-day):
         Use parametric VaR: VaR = portfolio_value × z_0.05 × daily_std_dev
         If 1-day VaR > 3% of equity, block new positions until reduced.

  3.2  FAMA-FRENCH FACTOR EXPOSURE MONITOR
       (Richard mentioned this directly. Fama-French is a multi-factor model
       for understanding the SOURCES of portfolio returns, not just the amount.)

       Track exposure to the three core factors:
         MARKET BETA (Mkt-Rf): correlation of portfolio to SPY
           Target: 0.3 - 0.8 (not market-neutral, but not fully correlated)
           If beta > 0.9: force hedge or reduce positions

         SIZE FACTOR (SMB): small cap vs. large cap exposure
           High SMB exposure = portfolio skews small cap (higher vol)
           Alert when SMB > 0.4 in low-liquidity regimes

         VALUE FACTOR (HML): value vs. growth tilt
           Track whether strategy is chasing high-momentum growth stocks
           (acceptable) or systematically overweighting distressed value (risky)

       Implementation: Daily factor exposure computed from position betas
       and sector weights stored in D1. Displayed in MCP risk-status tool.

  3.3  KELLY-OPTIMAL POSITION SIZING
       Replace fixed percentage limits with Kelly criterion sizing:
         kelly_fraction = (win_rate × avg_win) - ((1 - win_rate) × avg_loss)
                          ─────────────────────────────────────────────────
                                           avg_win

       Use fractional Kelly (typically 0.25× - 0.5× full Kelly) to avoid
       over-betting during uncertainty. Pull win_rate and avg_win/loss from
       the existing trade journal (memory system in D1).

       Kelly is computed per-strategy (LLM signal vs. L2 signal vs. external),
       not per-symbol. Different alpha sources have different edges.

       The policy engine validates Kelly-sized position against hard maximums.
       Kelly is a FLOOR for sizing; hard limits are the CEILING.

  3.4  CORRELATION CONCENTRATION GUARD
       The risk that kills systematic traders is correlation clustering:
       10 positions all moving together as if they are one position.

       Before approving any new buy:
         1. Compute rolling 30-day correlation of proposed symbol to each
            existing position.
         2. If average correlation > 0.65, warn. If > 0.80, block.
         3. Compute portfolio-level correlation score (average pair-wise corr).
            If portfolio correlation > 0.60, halt ALL new longs.

       This is the single most underappreciated risk in retail algo trading.
       V2 had no concept of this.

  3.5  AUTOMATED HEDGING TRIGGERS
       When risk metrics breach thresholds, trigger hedging automatically
       (not just kill switch):

         BETA HEDGE: If portfolio beta > 0.85 and regime = high_vol,
           buy SPY puts (1-2% notional) or open short ES futures (Phase 4).
           This reduces market exposure without liquidating core positions.

         CORRELATION HEDGE: If portfolio correlation > 0.70,
           add an uncorrelated or inverse position (TLT, GLD, VIX).

         DRAWDOWN HEDGE: If current drawdown > 5%,
           Scale out 25% of highest-beta positions automatically.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 4: SMART EXECUTION ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Estimated scope: 4-6 weeks (requires execution partner relationship)

  4.1  EXECUTION VENUE ABSTRACTION
       Create a provider interface that allows swapping execution venues:

       interface ExecutionProvider {
         createOrder(params: OrderParams): Promise<OrderResult>;
         getOrderStatus(id: string): Promise<OrderStatus>;
         cancelOrder(id: string): Promise<void>;
         getPositions(): Promise<Position[]>;
         getAccount(): Promise<Account>;
       }

       V3 ships with:
         AlpacaExecutionProvider  → paper trading and development only
         InstitutionalProvider    → Richard's firm's REST API (primary live)

       The two-step approval flow does not change. Only the final execution
       call in orders-submit routes to a different provider.

  4.2  SMART ORDER ROUTER (SOR)
       Before every live order, the SOR analyzes:

       LIQUIDITY CHECK (via L2 snapshot):
         If the order size > 1% of current bid/ask depth at inside price,
         do not use market order. Route to algo execution.

       VENUE SELECTION LOGIC:
         urgency = "immediate" AND size < 500 shares → LIT market (fast fill)
         urgency = "immediate" AND size > 500 shares → DARK POOL first
           (avoid moving the lit market price against yourself)
         urgency = "session"                         → VWAP algo (blend in)
         urgency = "swing"                           → TWAP algo (accumulate)

       MARKET IMPACT ESTIMATION (pre-trade):
         Almgren-Chriss model approximation:
           impact_bps ≈ 0.1 × (order_size / avg_daily_volume) ^ 0.6 × sigma
         If estimated impact > 5 bps on a tight spread stock, split the order.

  4.3  EXECUTION ALGORITHM LIBRARY
       Implemented as order_type parameters in orders-preview:

       VWAP ALGO:
         Execute the order over the session at or better than VWAP.
         Slices order into child orders proportional to historical volume curve.
         Best for medium urgency, medium size (0.5-5% ADV).

       TWAP ALGO:
         Time-weighted equal slicing. Used when volume pattern is uncertain.
         Simpler than VWAP but less market-adaptive.

       ICEBERG:
         Display only N shares of a large order. Replenish automatically.
         Used for large block positions where showing full size would move price.

       IMPLEMENTATION SHORTFALL:
         Minimize slippage from decision price. Most aggressive algo.
         Trades faster at the start to capture the signal before it decays.
         Appropriate for L2 microstructure signals (high urgency, short horizon).

  4.4  DARK POOL ROUTING PREFERENCE
       Via Richard's firm: direct access to all dark pools.
       For block trades (>$25K notional or >1,000 shares):
         Route to dark pool first for 60 seconds.
         If not filled, cross to lit market via ATS.
         If still not filled, use VWAP algo on lit.

       Dark pool fills result in zero market impact (by definition — the trade
       is not visible until after execution). This is the primary execution
       advantage of institutional access.

  4.5  EXECUTION QUALITY ANALYTICS (NEW MCP TOOLS)
       execution-report:
         For a given time period, compute:
           - VWAP vs. average fill price (implementation shortfall)
           - Average slippage in bps per order
           - % of orders dark vs. lit
           - % of orders fully filled vs. partially filled
           - Avg fill latency
           - Market impact per trade (compare to pre-trade estimate)

       This closes the learning loop. Every execution improves the SOR model.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 5: MULTI-ASSET EXPANSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Estimated scope: 4-6 weeks (requires futures API access)
Note: This expands on V2's existing options framework.

  5.1  OPTIONS (ENHANCE EXISTING V2 FRAMEWORK)
       V2 already has options support. V3 enhancements:
         - Options sentiment signal: options flow (unusual call/put buying)
           is a leading indicator. High unusual call buying before a breakout
           is informed flow, not retail speculation.
         - Gamma exposure (GEX) tracking: market maker delta hedging creates
           price pinning at high-OI strikes. Exploit this for entry/exit timing.
         - IV rank for premium evaluation: only sell premium when IV rank > 50.
         - Auto-select strikes: given a signal with confidence score, select the
           strike with delta closest to min_confidence.

  5.2  FUTURES FOR PORTFOLIO HEDGING
       Richard's firm has "direct access to high-frequency futures."
       V3 should integrate futures purely for hedging (not speculation):

         ES (S&P 500 futures): hedge aggregate portfolio beta
         NQ (Nasdaq futures): hedge tech-heavy positions
         CL (Crude Oil): hedge energy sector exposure
         GC (Gold): flight-to-safety positioning in risk-off regimes

       Sizing: hedge only enough to reduce portfolio beta to target (0.5).
       Do NOT over-hedge. This is insurance, not a directional bet.

       New MCP tool: hedge-portfolio
         Input: target_beta (default 0.5)
         Computes: current portfolio beta, required futures notional
         Output: standard AlphaSignal with direction="short" on appropriate future
         Routes through: orders-preview → orders-submit like any other order

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEW MCP TOOLS SUMMARY (V3 Additions)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  SIGNAL LAYER
    signal-submit          Inject an external AlphaSignal into the aggregator
    signal-list            View pending/recent signals and their status
    signal-aggregate       Force-aggregate signals for a symbol and preview result

  MARKET STRUCTURE
    orderbook-snapshot     L2 bid/ask depth (top 10 levels)
    orderbook-imbalance    Bid/ask volume imbalance ratio (directional pressure)
    darkpool-prints        Recent ATS/dark pool prints for a symbol
    spread-history         Track bid-ask spread over time (liquidity health)

  REGIME
    regime-current         Current regime classification across all dimensions
    regime-history         Historical regime transitions and their market impact
    regime-config          Update regime-to-strategy routing rules

  RISK
    portfolio-risk         Full risk report: Sharpe, Sortino, VaR, beta, drawdown
    factor-exposure        Fama-French factor loadings for current portfolio
    correlation-matrix     Pairwise correlations across all open positions
    kelly-sizes            Kelly-optimal sizes for each active signal source
    hedge-portfolio        Compute and submit delta hedge to target beta

  EXECUTION
    execution-report       Slippage, market impact, fill quality analytics
    order-algo             Select execution algorithm for a pending order
    venue-status           Check execution venue health and latency

  EXISTING (UPGRADED IN V3)
    orders-preview         Now includes L2 liquidity check + SOR recommendation
    orders-submit          Now routes to institutional venue (not only Alpaca)
    risk-status            Now includes Sharpe, VaR, factor exposure summary
    memory-summarize       Now regime-aware: analyzes performance per regime

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATABASE SCHEMA ADDITIONS (D1 migrations 0004-0007)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  0004_alpha_signals.sql
    alpha_signals:         id, source, symbol, direction, confidence, urgency,
                           horizon, rationale, regime_tags, status, created_at,
                           expires_at, aggregated_signal_id

    aggregated_signals:    id, symbol, final_direction, final_confidence,
                           source_count, conflict_detected, created_at

  0005_regime.sql
    regime_snapshots:      id, vol_regime, trend_regime, corr_regime,
                           macro_regime, liquidity_regime, vix_proxy,
                           portfolio_beta, recorded_at

    regime_rules:          id, regime_key, active_sources, max_position_pct,
                           size_multiplier, updated_at

  0006_portfolio_risk.sql
    risk_snapshots:        id, sharpe_30d, sortino_30d, var_95_1d,
                           max_drawdown_90d, portfolio_beta, avg_correlation,
                           fama_french_mkt, fama_french_smb, fama_french_hml,
                           computed_at

  0007_execution_quality.sql
    execution_fills:       id, order_id, symbol, side, qty, fill_price,
                           vwap_at_fill, slippage_bps, fill_latency_ms,
                           venue, algo_type, dark_pool_pct, created_at

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT IS DELIBERATELY EXCLUDED FROM V3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  FIX PROTOCOL IMPLEMENTATION:
    NightWatcher does not implement FIX. Richard's firm handles FIX-level
    execution. Our REST client talks to their REST API. They translate to FIX
    internally. Trying to implement FIX in Cloudflare Workers is the wrong
    layer. Focus on the alpha and risk layers, not the wire protocol.

  CO-LOCATION:
    NightWatcher will never beat co-located HFTs at microsecond latency.
    This is not the target. The target is sophisticated millisecond to
    second-scale execution with institutional data quality and venue access.
    That is a winnable game against other LLM-driven retail traders.

  MARKET MAKING:
    V3 is a directional/momentum trading system. Market making requires
    two-sided quoting, inventory management, and co-location. Not in scope.

  PROPRIETARY QUANT MODELS:
    Fama-French factor monitoring (Phase 3) uses linear regression on existing
    returns, not a proprietary factor model. Full factor model fitting requires
    historical data infrastructure beyond Cloudflare Workers. Phase 3 gives
    the observability without the build complexity.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION SEQUENCE (BUILD ORDER)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  WEEK 1-2:   Phase 0 — Foundation Hardening
                Remove StockTwits trigger. Define AlphaSignal interface.
                Build aggregator. Add WebSocket. Add execution quality logging.

  WEEK 3-5:   Phase 1 — Data Integration (requires API keys from Richard)
                Institutional feed client. L2 orderbook tools.
                Dark pool print ingestion. News velocity signal.

  WEEK 6-9:   Phase 2 — Regime + Alpha Engine
                Regime detector. Regime-conditional routing. All signal
                sources conforming to AlphaSignal interface.

  WEEK 10-13: Phase 3 — Quantitative Risk
                Sharpe/Sortino/VaR. Factor exposure. Kelly sizing.
                Correlation guard. Auto-hedge triggers.

  WEEK 14-19: Phase 4 — Smart Execution
                Execution provider abstraction. SOR with L2 liquidity check.
                VWAP/TWAP algos. Dark pool routing. Execution quality analytics.

  WEEK 20-25: Phase 5 — Multi-Asset
                Options upgrade with GEX and IV rank. Futures hedging tools.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE ONE-LINE THESIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  NightWatcher V3 is the world's first LLM-native institutional execution
  layer: an open alpha socket that routes any signal through institutional-
  grade risk controls, smart order routing, and direct exchange access —
  without touching a market maker.

================================================================================
```
