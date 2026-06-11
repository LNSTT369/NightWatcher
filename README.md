# ░▒▓ NIGHTWATCHER V3 // AUTONOMOUS QUANT TERMINAL

**Universal, self-hosted quantitative execution rail & multi-agent trading system.**  
*Local-first · Policy-gated · Non-custodial · Monospace-driven.*

```
 ╔═══════════════════════════════════════════════════════════════════╗
 ║  [SYSTEM // ACTIVE]                                               ║
 ║  → 7 Quant Strategies   → Pre-Trade Policy Gate (14 Constraints)  ║
 ║  → D1 Local Ledger      → Interactive Tenancy Onboarding Wizard   ║
 ╔═══════════════════════════════════════════════════════════════════╝
```

---

## ✦ [01 // INTRODUCTION]

**NIGHTWATCHER V3** is a private family office trading infrastructure that runs specialized LLM-powered agents and deterministic algorithmic runners. It is built to analyze equities, debate market risk, and route execution orders directly to **Alpaca** while maintaining absolute data sovereignty.

Designed with a high-contrast, brutalist monochrome aesthetic, it provides a complete trading terminal experience for quants and discretionary traders alike, allowing zero-friction strategy deployments from any language, public repository, or webhook signal.

---

## ✦ [02 // ZERO-FRICTION SETUP]

You do not need to manually provision databases, configure local variables, or write config files. The entire system is built to install and run automatically.

### 🚀 Launch Command

```bash
# 1. Clone the repository
git clone https://github.com/LNSTT369/NightWatcher.git
cd NightWatcher

# 2. Run the universal starter script
./start.sh
```

### 📦 What Happens Automatically:
1. **Dependency Installation:** The script checks for and installs all root backend and dashboard frontend dependencies.
2. **Database Provisioning:** Seeds the local D1 SQLite database and applies migrations `0001` through `0012` non-interactively.
3. **Services Startup:** Boots the MCP server, Dashboard API, Vite/React Dashboard UI, and all strategy runners concurrently.

### ⚙️ Tenancy Onboarding:
* Once `./start.sh` finishes, open **`http://localhost:3000`** in your browser.
* The interactive **Setup Wizard** will launch. Review the risk disclaimers and input your Alpaca API credentials.
* Your credentials are encrypted on-device via AES-GCM (using `KILL_SWITCH_SECRET`) and saved locally. Your keys never leave your machine.

---

## ✦ [03 // HOW IT WORKS]

Every trade order routes through a two-step execution flow to protect capital and prevent system runaways:

```
    [Signal Source] (REST / WebSocket / MCP Agent)
           │
           ▼
┌──────────────────────────────────────┐
│  orders-preview (14 Policy Checks)   │
│  - Cooldown checks                   │
│  - Kelly criterion position sizing   │
│  - Daily loss limit clamping         │
└──────────────────┬───────────────────┘
                   │  (Generates HMAC-signed approval token, 5-min TTL)
                   ▼
┌──────────────────────────────────────┐
│  orders-submit (Verifies signature)  │
│  - Re-evaluates platform kill-switch │
│  - Submits trade directly to Alpaca  │
└──────────────────────────────────────┘
```

---

## ✦ [04 // STRATEGY ENGINE]

NIGHTWATCHER runs 7 strategies out-of-the-box, each running isolated sandboxed run loops:

| Strategy | Algorithmic Mechanism | Session Window | Risk Exit Rule |
| :--- | :--- | :--- | :--- |
| **ORB** | Opening Range Breakout | First 15–60 min of RTH | Opposite range side / fixed profit target |
| **Momentum Breakout** | Volume-confirmed breakouts | Intraday (Morning session) | ADR% deviation trailing stop |
| **Gap and Go** | Pre-market overnight gap capture | Market Open (First 30 min) | Forced close-of-session market exit |
| **Mean Reversion** | Extended deviation from VWAP | Continuous | Return to VWAP mean / tight stop loss |
| **Options Momentum** | Leveraged call/put legs | Continuous | Delta-based trailing stop |
| **VWAP Reversion** | Volume-weighted average reversion | Continuous | Overbought/oversold Bollinger exit |
| **VP-MACD** | Volume-profile MACD divergence | Continuous | MACD histogram shift + volume check |

---

## ✦ [05 // TECHNICAL MATRIX]

* **Runtime:** Cloudflare Workers, Durable Objects, Node.js.
* **Storage:** local D1 SQLite (persistent ledger) & KV Namespace (hot cache).
* **Interface Protocols:**
  * **REST API:** `POST /api/signal`
  * **WebSocket Stream:** `/stream`
  * **Model Context Protocol (MCP):** Connects to any desktop AI client (Claude, Cursor) as a native toolset.
* **Security & TENANCY:** Two-step HMAC-signed token approval with full database audit logging.

---

## ✦ [06 // DIRECTORY STRUCTURE]

```
NIGHTWATCHER/
├── src/                          # Backend source files (Workers & endpoints)
│    ├── api/                     # Setup API and signal endpoints
│    ├── mcp/                     # Model Context Protocol tool definitions
│    ├── policy/                  # Pre-trade Policy Engine checks
│    └── durable-objects/         # Stateful session control
├── dashboard/                    # React frontend dashboard UI
├── migrations/                   # Local database schema definitions
├── strategies/                   # Algorithmic strategy runners
├── scripts/                      # Production API & execution scripts
└── _archive/                     # Ignored local backup directory
```

---

## ✦ [07 // DISCLAIMER]

This software is for **educational and informational purposes only.** Nothing in this repository constitutes financial, investment, advisory, legal, or tax advice. All trading decisions are made at your own risk. Markets are highly volatile, and you can lose some or all of your capital. The authors are not responsible for any financial losses resulting from the use of this software. Always start with Paper Trading enabled and never trade with capital you cannot afford to lose.

---
<sup>Licensed under the MIT License. Built with a commitment to privacy, performance, and self-sovereign code.</sup>
