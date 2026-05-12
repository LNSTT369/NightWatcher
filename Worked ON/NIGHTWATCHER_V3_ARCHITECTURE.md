```
================================================================================
NIGHTWATCHER V3 — FULL SYSTEM ARCHITECTURE
================================================================================


╔══════════════════════════════════════════════════════════════════════════════╗
║                        EXTERNAL DATA SOURCES                                ║
╠═══════════════╦══════════════╦══════════════╦══════════════╦════════════════╣
║  POLYGON.IO   ║  BENZINGA    ║  SEC EDGAR   ║  FMP         ║ RICHARD'S FIRM ║
║  SIP-Quality  ║  Real-Time   ║  8-K / 13F / ║  Analyst     ║ Alpha Gen Tool ║
║  NBBO Quotes  ║  News Feed   ║  Form 4      ║  Reports     ║ (AlphaSignal)  ║
║  L2 Depth     ║  Tagged by   ║  Streaming   ║  EPS Est.    ║                ║
║  Dark Pool    ║  Symbol      ║  ATOM Feed   ║  Targets     ║                ║
║  ATS Prints   ║              ║              ║              ║                ║
╚═══════════════╩══════════════╩══════════════╩══════════════╩════════════════╝
        ║               ║              ║              ║               ║
        ║    REST / WebSocket Streams (via Master MCP Layer)         ║
        ║               ║              ║              ║               ║
        ▼               ▼              ▼              ▼               ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║                     INSTITUTIONAL DATA CLIENT                               ║
║             src/providers/institutional/client.ts                           ║
║                                                                             ║
║  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────────────┐  ║
║  │  MARKET DATA    │  │   NEWS STREAM    │  │  FILINGS STREAM           │  ║
║  │                 │  │                 │  │                           │  ║
║  │  • NBBO quotes  │  │  • Benzinga     │  │  • 8-K (material events)  │  ║
║  │  • L2 bid/ask   │  │  • News         │  │  • Form 4 (insider)       │  ║
║  │    stack depth  │  │    velocity     │  │  • 13F (fund positions)    │  ║
║  │  • Trade tape   │  │    score        │  │  • 10-Q / 10-K            │  ║
║  │  • Dark pool    │  │  • Symbol tags  │  │                           │  ║
║  │    ATS prints   │  │    pre-tagged   │  │                           │  ║
║  └─────────────────┘  └──────────────────┘  └───────────────────────────┘  ║
╚══════════════════════════════════════════════════════════════════════════════╝
        ║                       ║                       ║
        ▼                       ▼                       ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║                         REGIME DETECTION ENGINE                             ║
║                       src/regime/detector.ts                                ║
║            ┌─ Computed every 5 min ─ Cached in KV ─────────────┐           ║
║            │                                                    │           ║
║  VOLATILITY REGIME    TREND REGIME      CORRELATION     LIQUIDITY           ║
║  ─────────────────    ────────────      ───────────     ─────────           ║
║  • low  (VIX<15)      • strong_up       • risk_on       • ample             ║
║  • normal (15-25)     • weak_up         • normal        • constrained       ║
║  • high (25-40)       • sideways        • risk_off      • seized            ║
║  • crisis (>40)       • weak_down                                           ║
║                       • strong_down   MACRO REGIME                          ║
║                                       ─────────────                         ║
║                                       • rate_rising                         ║
║                                       • rate_stable    ┌─────────────────┐ ║
║                                       • rate_falling   │ CURRENT REGIME  │ ║
║                                                        │  SNAPSHOT (KV)  │ ║
║            └────────────────────────────────────────── │  5-min TTL      │ ║
║                                                        └────────┬────────┘ ║
╚════════════════════════════════════════════════════════════════ ║ ══════════╝
                                                                  ║
                    REGIME CONDITIONS ALL LAYERS BELOW            ║
                    (signal routing, risk budgets, sizing)        ║
                                                                  ║
╔═══════════════════════════════════════════════════════ ◄════════╝ ══════════╗
║                          SIGNAL LAYER                                       ║
║                                                                             ║
║  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐ ║
║  │  A · LLM     │ │  B · TECHNI- │ │  C · L2 MICRO│ │  D · DARK POOL     │ ║
║  │  RESEARCH    │ │  CAL MOMENTUM│ │  STRUCTURE   │ │  ACCUMULATION      │ ║
║  │              │ │              │ │              │ │                    │ ║
║  │ Input:       │ │ Input:       │ │ Input:       │ │ Input:             │ ║
║  │ news, 8-K,   │ │ Price bars   │ │ L2 bid/ask   │ │ ATS dark pool      │ ║
║  │ earnings,    │ │ from inst.   │ │ real-time    │ │ print tape         │ ║
║  │ Form 4       │ │ feed         │ │ depth        │ │                    │ ║
║  │              │ │              │ │              │ │ Logic:             │ ║
║  │ Logic:       │ │ Logic:       │ │ Logic:       │ │ dark pool share    │ ║
║  │ LLM classif. │ │ SMA, RSI,    │ │ bid/ask      │ │ > threshold AND    │ ║
║  │ → event type │ │ MACD, VWAP   │ │ imbalance    │ │ direction aligned  │ ║
║  │ → confidence │ │ deviation,   │ │ ratio, sweep │ │                    │ ║
║  │              │ │ sector mom.  │ │ detection    │ │ Confidence: 0.9    │ ║
║  │ Confidence:  │ │              │ │              │ │ Urgency: session   │ ║
║  │ 0.4 (swing)  │ │ Confidence:  │ │ Confidence:  │ │ TTL: same day      │ ║
║  │ TTL: 4-24h   │ │ 0.6 (intra.) │ │ 0.8 (immed.) │ │                    │ ║
║  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └─────────┬──────────┘ ║
║         │                │                │                   │            ║
║  ┌──────────────┐                                    ┌────────────────────┐ ║
║  │  E · EXTERN. │                                    │  F · MANUAL        │ ║
║  │  ALPHA SIGNAL│                                    │  OVERRIDE          │ ║
║  │  (Richard's) │                                    │                    │ ║
║  │              │                                    │ Human-submitted    │ ║
║  │ HTTP webhook │                                    │ via MCP tool       │ ║
║  │ or MCP call  │                                    │ requires rationale │ ║
║  │              │                                    │ conf. capped 0.95  │ ║
║  │ Confidence:  │                                    │                    │ ║
║  │ configurable │                                    │                    │ ║
║  └──────┬───────┘                                    └─────────┬──────────┘ ║
║         │                │                │                   │            ║
║         └────────────────┴────────────────┴───────────────────┘            ║
║                                     ▼                                       ║
║                                                                             ║
║              ALL SOURCES EMIT ──► AlphaSignal INTERFACE                    ║
║              ─────────────────────────────────────────                     ║
║              signal_id · source · symbol · asset_class                     ║
║              direction · confidence · urgency · horizon                    ║
║              regime_tags · rationale · supporting_data                     ║
║              generated_at · ttl_seconds                                    ║
║                                     │                                       ║
║                                     ▼                                       ║
║  ╔═════════════════════════════════════════════════════════════════════╗    ║
║  ║               ALPHA SIGNAL AGGREGATOR                              ║    ║
║  ║             src/signals/aggregator.ts                              ║    ║
║  ║                                                                    ║    ║
║  ║  For each symbol with ≥1 pending signal:                          ║    ║
║  ║                                                                    ║    ║
║  ║  score = Σ ( confidence_i × freshness_decay_i × source_weight_i ) ║    ║
║  ║  freshness_decay = exp( -elapsed_seconds / ttl_seconds )          ║    ║
║  ║                                                                    ║    ║
║  ║  ┌────────────────────────────────────────────────────────────┐   ║    ║
║  ║  │  CONFLICT RESOLUTION                                        │   ║    ║
║  ║  │  Same direction  →  combine confidence (cap 0.95)          │   ║    ║
║  ║  │  Conflicting     →  emit NEUTRAL · log · no trade          │   ║    ║
║  ║  │  Single signal   →  pass through at source weight          │   ║    ║
║  ║  │  CRISIS regime   →  override all → exit + halt             │   ║    ║
║  ║  └────────────────────────────────────────────────────────────┘   ║    ║
║  ║                                                                    ║    ║
║  ║     OUTPUT: AggregatedSignal → direction · final_confidence       ║    ║
║  ╚═════════════════════════════════════════════════════════════════════╝    ║
╚══════════════════════════════════════════════════════════════════════════════╝
                                     ║
                                     ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║                         VALIDATION LAYER                                    ║
║                                                                             ║
║   ┌──────────────────────────────┐   ┌──────────────────────────────────┐  ║
║   │     POLICY ENGINE (V2)       │   │    QUANT RISK ENGINE (NEW)        │  ║
║   │   src/policy/engine.ts       │   │    src/risk/quant.ts              │  ║
║   │                              │   │                                   │  ║
║   │  ✓ Kill switch               │   │  ✓ Sharpe ratio (30d rolling)     │  ║
║   │  ✓ Loss cooldown             │   │    halt longs if Sharpe < 0       │  ║
║   │  ✓ Daily loss limit          │   │                                   │  ║
║   │  ✓ Market hours              │   │  ✓ Portfolio VaR 95% (1-day)      │  ║
║   │  ✓ Symbol allow/deny lists   │   │    block if VaR > 3% equity       │  ║
║   │  ✓ Order type restrictions   │   │                                   │  ║
║   │  ✓ Notional limits           │   │  ✓ Max drawdown guard (90d)       │  ║
║   │  ✓ Buying power check        │   │    50% size if DD > 50% of hist.  │  ║
║   │  ✓ Short selling guard       │   │                                   │  ║
║   │  ✓ Max open positions        │   │  ✓ Fama-French factor exposure     │  ║
║   │                              │   │    Mkt-Rf beta · SMB · HML        │  ║
║   │  NEW:                        │   │    warn if beta > 0.85            │  ║
║   │  ✓ Kelly-adjusted sizing     │   │                                   │  ║
║   │    (floor, not ceiling)      │   │  ✓ Correlation concentration      │  ║
║   │  ✓ Regime-adjusted budget    │   │    warn > 0.65 · block > 0.80     │  ║
║   │  ✓ L2 liquidity check        │   │                                   │  ║
║   │    pre-order (via SOR)       │   │  ✓ Auto-hedge triggers            │  ║
║   │                              │   │    beta > 0.85 → hedge            │  ║
║   └──────────────┬───────────────┘   │    corr > 0.70 → diversify        │  ║
║                  │                   │    DD > 5% → scale out 25%        │  ║
║                  │                   └──────────────┬────────────────────┘  ║
║                  └──────────────────────────────────┘                       ║
║                                     │                                       ║
║                         ALL CHECKS PASS?                                    ║
║                         ┌───────────┴──────────┐                           ║
║                         │ YES                  │ NO                        ║
║                         ▼                      ▼                           ║
║                ┌─────────────────┐    ┌────────────────────┐               ║
║                │ APPROVAL TOKEN  │    │ REJECTION RESPONSE │               ║
║                │ HMAC-signed     │    │ violation[] + code │               ║
║                │ TTL = 300s      │    │ logged to D1       │               ║
║                │ stored in D1    │    └────────────────────┘               ║
║                └────────┬────────┘                                         ║
╚═════════════════════════║════════════════════════════════════════════════════╝
                           ║
                  token passed to orders-submit
                           ║
                           ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║                         EXECUTION LAYER                                     ║
║                                                                             ║
║   ╔═══════════════════════════════════════════════════════════════════╗     ║
║   ║                   SMART ORDER ROUTER (SOR)                       ║     ║
║   ║                   src/execution/router.ts                        ║     ║
║   ║                                                                   ║     ║
║   ║   STEP 1: L2 LIQUIDITY CHECK                                     ║     ║
║   ║   ─────────────────────────────                                  ║     ║
║   ║   order_size vs. current inside bid/ask depth                    ║     ║
║   ║   if order > 1% of depth  →  algo execution                      ║     ║
║   ║   if order ≤ 1% of depth  →  direct market order                 ║     ║
║   ║                                                                   ║     ║
║   ║   STEP 2: MARKET IMPACT ESTIMATE (Almgren-Chriss)                ║     ║
║   ║   ─────────────────────────────────────────────                  ║     ║
║   ║   impact_bps ≈ 0.1 × (size / ADV)^0.6 × sigma                   ║     ║
║   ║   if impact > 5 bps  →  split order                              ║     ║
║   ║                                                                   ║     ║
║   ║   STEP 3: VENUE + ALGO SELECTION                                 ║     ║
║   ║   ──────────────────────────────                                 ║     ║
║   ║                                                                   ║     ║
║   ║   ┌─────────────────┬────────────────┬──────────────────────┐    ║     ║
║   ║   │ SIGNAL URGENCY  │ ORDER SIZE     │ ROUTING DECISION      │    ║     ║
║   ║   ├─────────────────┼────────────────┼──────────────────────┤    ║     ║
║   ║   │ immediate       │ < 500 shares   │ LIT market (fast)     │    ║     ║
║   ║   │ immediate       │ > 500 shares   │ DARK POOL first       │    ║     ║
║   ║   │                 │                │ → lit if unfilled 60s  │    ║     ║
║   ║   │ session         │ any            │ VWAP algo             │    ║     ║
║   ║   │ swing           │ any            │ TWAP algo             │    ║     ║
║   ║   │ block (>$25K)   │ any            │ DARK POOL → ATS       │    ║     ║
║   ║   │                 │                │ → VWAP if unfilled    │    ║     ║
║   ║   └─────────────────┴────────────────┴──────────────────────┘    ║     ║
║   ╚═══════════════════════════════════════════════════════════════════╝     ║
║                                     │                                       ║
║         ┌───────────────────────────┴────────────────────────┐             ║
║         │                                                     │             ║
║         ▼                                                     ▼             ║
║  ┌──────────────────────────┐                   ┌────────────────────────┐  ║
║  │  EXECUTION ALGORITHMS    │                   │  EXECUTION VENUES      │  ║
║  │                          │                   │                        │  ║
║  │  VWAP                    │                   │  ┌──────────────────┐  │  ║
║  │  Execute at or better    │                   │  │ DARK POOLS / ATS │  │  ║
║  │  than session VWAP       │                   │  │ (all, via R's    │  │  ║
║  │  Volume-proportional     │                   │  │ firm)            │  │  ║
║  │  child orders            │                   │  │ Zero market      │  │  ║
║  │                          │                   │  │ impact fills     │  │  ║
║  │  TWAP                    │                   │  └──────────────────┘  │  ║
║  │  Time-weighted equal     │                   │  ┌──────────────────┐  │  ║
║  │  slicing across session  │                   │  │ LIT EXCHANGES    │  │  ║
║  │                          │                   │  │ (14 direct, via  │  │  ║
║  │  ICEBERG                 │                   │  │ agency member)   │  │  ║
║  │  Show N shares, replenish│                   │  │ Best price, no   │  │  ║
║  │  auto, conceal size      │                   │  │ PFOF routing     │  │  ║
║  │                          │                   │  └──────────────────┘  │  ║
║  │  IMPL. SHORTFALL         │                   │  ┌──────────────────┐  │  ║
║  │  Minimize slippage from  │                   │  │ ALPACA (paper    │  │  ║
║  │  decision price          │                   │  │ / dev only)      │  │  ║
║  │  Most aggressive         │                   │  │ PFOF model       │  │  ║
║  │                          │                   │  │ dev / backtest   │  │  ║
║  └──────────────────────────┘                   │  │ only             │  │  ║
║                                                 │  └──────────────────┘  │  ║
║                                                 └────────────────────────┘  ║
║                                     │                                       ║
║                              ORDER FILLED                                   ║
║                                     │                                       ║
║                                     ▼                                       ║
║  ┌──────────────────────────────────────────────────────────────────────┐   ║
║  │                   EXECUTION QUALITY ANALYTICS                        │   ║
║  │                 src/storage/d1/queries/execution_fills.ts            │   ║
║  │                                                                      │   ║
║  │  slippage_bps · fill_latency_ms · VWAP vs. fill · dark_pool_pct     │   ║
║  │  partial_fill_pct · pre-trade impact estimate vs. actual             │   ║
║  │  Feeds back → SOR model improvement on next order                    │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════════════════════╝
                                     ║
                                     ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║                          PERSISTENCE LAYER                                  ║
║                                                                             ║
║  ┌────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐ ║
║  │   D1 DATABASE      │  │   KV NAMESPACE       │  │   R2 BUCKET          │ ║
║  │   (audit + state)  │  │   (hot cache)        │  │   (artifacts)        │ ║
║  │                    │  │                      │  │                      │ ║
║  │  trades            │  │  current_regime      │  │  execution reports   │ ║
║  │  approvals         │  │  risk_snapshot       │  │  research reports    │ ║
║  │  tool_logs         │  │  orderbook_cache     │  │  signal archives     │ ║
║  │  alpha_signals     │  │  news_velocity       │  │  backtest results    │ ║
║  │  agg_signals       │  │  session_state       │  │                      │ ║
║  │  regime_snapshots  │  │  policy_config       │  │                      │ ║
║  │  regime_rules      │  │  kelly_sizes         │  │                      │ ║
║  │  risk_snapshots    │  │                      │  │                      │ ║
║  │  execution_fills   │  │  TTLs: 1-5 minutes   │  │                      │ ║
║  │  journal / memory  │  │                      │  │                      │ ║
║  │  events / news     │  │                      │  │                      │ ║
║  │  policy_config     │  │                      │  │                      │ ║
║  │  risk_state        │  │                      │  │                      │ ║
║  └────────────────────┘  └──────────────────────┘  └──────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════════════════╝
                                     ║
                                     ▼
╔══════════════════════════════════════════════════════════════════════════════╗
║                      CLOUDFLARE WORKERS RUNTIME                             ║
║                                                                             ║
║  ┌──────────────────────────────────────────────────────────────────────┐   ║
║  │                         src/index.ts                                 │   ║
║  │                                                                      │   ║
║  │   GET  /health    →  status check                                    │   ║
║  │   GET  /          →  system info                                     │   ║
║  │   ANY  /mcp/*     →  NightwatcherMcpAgent (Durable Object)           │   ║
║  │   WS   /stream    →  WebSocket endpoint (L2 data ingestion)  [NEW]   │   ║
║  │                                                                      │   ║
║  │   Scheduled:      →  handleCronEvent(cronId, env)                   │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
║                                     │                                       ║
║                                     ▼                                       ║
║  ╔════════════════════════════════════════════════════════════════════╗      ║
║  ║           NightwatcherMcpAgent (Durable Object)                   ║      ║
║  ║                   src/mcp/agent.ts                                ║      ║
║  ║                                                                   ║      ║
║  ║  TOOL GROUPS (50+ tools across 14 categories):                   ║      ║
║  ║                                                                   ║      ║
║  ║  AUTH          auth-verify · user-get                             ║      ║
║  ║  ACCOUNT       accounts-get · portfolio-get · portfolio-history   ║      ║
║  ║  POSITIONS     positions-list · positions-close                   ║      ║
║  ║  ORDERS        orders-preview ──► orders-submit (2-step)          ║      ║
║  ║  RISK          risk-status · kill-switch-enable/disable           ║      ║
║  ║  MEMORY        memory-log-trade/outcome · memory-query            ║      ║
║  ║  MARKET DATA   symbol-overview · prices-bars · market-clock       ║      ║
║  ║  TECHNICALS    technicals-get · signals-get · signals-batch       ║      ║
║  ║  EVENTS        events-ingest · events-list · events-classify      ║      ║
║  ║  NEWS          news-list · news-index                             ║      ║
║  ║  RESEARCH      symbol-research · symbol-analyze · web-scrape      ║      ║
║  ║  OPTIONS       options-chain · options-order-preview/submit       ║      ║
║  ║  UTILITY       help-usage · catalog-list                          ║      ║
║  ║                                                                   ║      ║
║  ║  NEW IN V3:                                                       ║      ║
║  ║  SIGNAL        signal-submit · signal-list · signal-aggregate     ║      ║
║  ║  MICROSTRUCTURE orderbook-snapshot · orderbook-imbalance          ║      ║
║  ║                darkpool-prints · spread-history                   ║      ║
║  ║  REGIME        regime-current · regime-history · regime-config    ║      ║
║  ║  QUANT RISK    portfolio-risk · factor-exposure · kelly-sizes     ║      ║
║  ║                correlation-matrix · hedge-portfolio               ║      ║
║  ║  EXECUTION     execution-report · order-algo · venue-status       ║      ║
║  ╚════════════════════════════════════════════════════════════════════╝      ║
╚══════════════════════════════════════════════════════════════════════════════╝


────────────────────────────────────────────────────────────────────────────────
CRON SCHEDULE (updated)
────────────────────────────────────────────────────────────────────────────────

  */5 13-20 * * 1-5    Event ingestion — SEC EDGAR + news velocity check
                         (StockTwits removed as primary trigger)
  0 14 * * 1-5          Market open prep — cleanup + regime snapshot init
  30 21 * * 1-5         Market close — execution quality report + regime log
  0 5 * * *             Midnight reset — daily loss · Kelly size recalculation
  0 * * * *             Hourly — risk snapshot · factor exposure · corr matrix
  */1 13-20 * * 1-5    [NEW] Per-minute — regime drift check during market hours


────────────────────────────────────────────────────────────────────────────────
ORDER LIFECYCLE (end-to-end)
────────────────────────────────────────────────────────────────────────────────

  AlphaSignal received
       │
       ▼
  Aggregator weights + conflict-resolves
       │
       ▼
  Regime engine conditions the signal
  (is this signal type valid in current regime?)
       │
       ├─── NO → signal rejected, logged, no order
       │
       ▼
  orders-preview called
       │
       ├─► Policy Engine  (static limits, kill switch, position size)
       ├─► Quant Risk     (Sharpe, VaR, factor exposure, correlation)
       ├─► L2 Liquidity   (is there enough depth to fill without impact?)
       │
       ├─── any violation → failure response, logged to D1
       │
       ▼
  HMAC approval token generated (TTL 300s, stored in D1)
       │
       ▼
  orders-submit called with token
       │
       ├─► Kill switch re-checked
       ├─► Token validated (not expired, not used, signature verified)
       ├─► Market hours checked
       │
       ▼
  Smart Order Router decides venue + algo
       │
       ├─► Dark pool / ATS (size > threshold)
       ├─► VWAP / TWAP algo (session urgency)
       └─► Direct market (small, immediate)
       │
       ▼
  Execution provider sends order
  (InstitutionalProvider for live / AlpacaProvider for paper)
       │
       ▼
  Fill received → execution quality recorded to D1
  (slippage, latency, VWAP comparison, dark pool %)
       │
       ▼
  memory-log-trade records signal source, regime, technicals at entry
  (closes the learning loop for Kelly size recalculation)


────────────────────────────────────────────────────────────────────────────────
MIGRATION PATH FROM V2 → V3
────────────────────────────────────────────────────────────────────────────────

  PRESERVED UNCHANGED          UPGRADED                   NEW IN V3
  ──────────────────────       ──────────────────────     ──────────────────
  Durable Object pattern       orders-preview (+ L2)      AlphaSignal interface
  HMAC approval tokens         orders-submit (+ SOR)      Signal aggregator
  Two-step order flow          risk-status (+ quant)      Regime engine
  D1 / KV / R2 storage         symbol-overview (+ L2)     Quant risk engine
  Policy engine (hardened)     memory system (+ regime)   Smart Order Router
  LLM provider abstraction     technicals (+ vol profile) Execution algos
  MCP tool surface             LLM classifier (+ decay)   Dark pool routing
  Cron job scaffold            options tools (+ GEX/IV)   Execution quality DB
                                                          Factor exposure
                                                          Correlation guard
                                                          Auto-hedge tools
                                                          Futures hedging
                                                          WebSocket ingestion
================================================================================
```
