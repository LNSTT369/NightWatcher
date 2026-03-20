import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG_PATH = path.join(process.cwd(), "agent-config.json");
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
const MCP_URL = config.mcp_url || "http://localhost:8787/mcp";

// ============================================================================
// HELPERS
// ============================================================================
function log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, Object.keys(data).length ? JSON.stringify(data) : "");
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// AI AGENT CLASS
// ============================================================================
class AiAgent {
    constructor() {
        this.client = null;
        this.transport = null;
    }

    async connect() {
        this.transport = new SSEClientTransport(new URL(MCP_URL));
        this.client = new Client({ name: "nightwatcher-ai", version: "1.0" }, { capabilities: {} });
        await this.client.connect(this.transport);
        log("info", "Connected to Nightwatcher MCP Server");
    }

    async analyzeAndTrade(symbol) {
        log("info", `Analyzing ${symbol} with Gemini...`);

        // 1. Call AI Analysis Tool
        const analysisResult = await this.client.callTool({
            name: "symbol-analyze",
            arguments: { symbol }
        });

        if (analysisResult.isError) {
            log("error", "Analysis failed", JSON.parse(analysisResult.content[0].text));
            return;
        }

        const { verdict, confidence, reasoning } = JSON.parse(analysisResult.content[0].text);
        log("info", `AI Verdict for ${symbol}: ${verdict} (${(confidence * 100).toFixed(0)}%)`, { reasoning });

        // 2. Execute Trade if BUY and High Confidence
        if (verdict === "BUY" && confidence >= 0.75) {
            log("info", `Executing BUY for ${symbol} based on AI signal`);

            const notional = 1000; // Fixed size for beta

            // Preview
            const previewResult = await this.client.callTool({
                name: "orders-preview",
                arguments: {
                    symbol,
                    side: "buy",
                    notional,
                    order_type: "market",
                    time_in_force: "day"
                }
            });

            const previewData = JSON.parse(previewResult.content[0].text);
            if (!previewData.ok || !previewData.data.policy.allowed) {
                log("warn", "Trade blocked by policy", previewData.data?.policy?.violations);
                return;
            }

            // Submit
            const submitResult = await this.client.callTool({
                name: "orders-submit",
                arguments: { approval_token: previewData.data.policy.approval_token }
            });

            const submitData = JSON.parse(submitResult.content[0].text);
            if (submitData.ok) {
                log("success", "Trade Executed!", submitData.data.order);
            } else {
                log("error", "Trade Submission Failed", submitData);
            }

        } else {
            log("info", `Skipping trade for ${symbol} (Verdict: ${verdict}, Confidence: ${confidence})`);
        }
    }

    async run() {
        await this.connect();

        // Symbols to watch (mix of Tech and Crypto)
        const WATCHLIST = ["AAPL", "NVDA", "BTC/USD", "ETH/USD"];

        log("info", "Starting AI Trading Loop...");
        log("info", `Watchlist: ${WATCHLIST.join(", ")}`);

        while (true) {
            for (const symbol of WATCHLIST) {
                try {
                    await this.analyzeAndTrade(symbol);
                } catch (e) {
                    log("error", `Error processing ${symbol}`, { error: e.message });
                }
                await sleep(5000); // Wait 5s between symbols to be nice to API
            }

            log("info", "Cycle complete. Waiting 1 minute...");
            await sleep(60000);
        }
    }
}

// Start the agent
const agent = new AiAgent();
agent.run().catch(e => console.error(e));
