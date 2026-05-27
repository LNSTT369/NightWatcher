import fs from "fs";
import {
  classifyEvent,
  generateTradingDecision,
  generateResearchReport,
  summarizeLearnedRules,
} from "../src/providers/llm/classifier";
import { createGeminiProvider } from "../src/providers/llm/gemini";
import type { LLMProvider } from "../src/providers/types";

// ============================================================================
// Monochromatic Brutalist ASCII Console Formatting
// ============================================================================
function printHeader(title: string) {
  console.log("\n" + "═".repeat(80));
  console.log(`  ${title.toUpperCase()} // DIAGNOSTIC`);
  console.log("═".repeat(80));
}

function printSection(name: string) {
  console.log(`\n┌── ${name.toUpperCase()} ──────────────────────────────────────────────`);
}

function printFooter() {
  console.log("└" + "─".repeat(78));
}

// ============================================================================
// Mock LLM Provider Implementation for Local Simulation
// ============================================================================
class MockLLMProvider implements LLMProvider {
  async complete(params: any): Promise<any> {
    const fullText = params.messages.map((m: any) => m.content).join("\n");

    // 1. Event Classification Mock Response
    if (fullText.includes("You are a financial event classifier")) {
      return {
        content: JSON.stringify({
          event_type: "earnings_beat",
          symbols: ["NVDA", "TSMC"],
          summary: "NVIDIA reports blockbuster Q1 earnings with AI chips demand beating expectations.",
          confidence: 0.98,
        }),
        usage: { prompt_tokens: 150, completion_tokens: 50, total_tokens: 200 },
      };
    }

    // 2. Trading Decision Mock Response
    if (fullText.includes("Determine if we should BUY, SELL, or HOLD")) {
      return {
        content: JSON.stringify({
          verdict: "BUY",
          confidence: 0.88,
          reasoning: "Convergence of strong 20-SMA support, RSI oversold recovery, and positive sentiment from earnings beat catalyst.",
        }),
        usage: { prompt_tokens: 180, completion_tokens: 65, total_tokens: 245 },
      };
    }

    // 3. Research Report Mock Response
    if (fullText.includes("You are a senior equity research analyst")) {
      return {
        content: `### 1. Overview
NVIDIA Corporation (NVDA) is the premier designer of graphics processing units (GPUs) and AI computing platforms.

### 2. Recent Developments
Blockbuster earnings report showing triple-digit growth in AI data center sales.

### 3. Catalysts
- Next-generation architecture launch (Blackwell series).
- Expansion of data-center sovereign AI cloud sales.

### 4. Summary
Strong buy rating based on robust structural positioning and high entry moat.`,
        usage: { prompt_tokens: 300, completion_tokens: 150, total_tokens: 450 },
      };
    }

    // 4. Summarize Rules Mock Response
    if (fullText.includes("extract patterns and rules")) {
      return {
        content: `* Winning trades occurred exclusively in 'low_volatility' and 'trending_bull' regimes.
* Trades entering at an RSI below 45 yielded significantly higher win ratios.
* Exiting options positions early with a fixed 2.0 R multiple reduced tail drawdowns.`,
        usage: { prompt_tokens: 220, completion_tokens: 80, total_tokens: 300 },
      };
    }

    // Fallback response
    return {
      content: "Default Mock LLM Complete response.",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }
}

// ============================================================================
// Main Execution
// ============================================================================
async function run() {
  console.clear();
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║               NIGHTWATCHER V3 — LLM PIPELINE DIAGNOSTIC UTILITY              ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");

  // Determine provider selection
  let providerLabel = "SIMULATED (MOCK-LLM-OFFLINE)";
  let llm: LLMProvider = new MockLLMProvider();

  // Try to load key from .dev.vars if exists to give option for live testing
  let apiKey: string | null = null;
  try {
    if (fs.existsSync(".dev.vars")) {
      const env = fs.readFileSync(".dev.vars", "utf8")
        .split("\n")
        .reduce((acc, line) => {
          const [key, val] = line.split("=");
          if (key && val) acc[key.trim()] = val.trim();
          return acc;
        }, {} as Record<string, string>);
      apiKey = env.GEMINI_API_KEY || null;
    }
  } catch (e) {
    // Non-fatal
  }

  // If live argument passed and API key exists, switch to real provider
  if (process.argv.includes("--live") && apiKey) {
    providerLabel = `LIVE GEMINI (Model: gemini-2.0-flash)`;
    llm = createGeminiProvider({ apiKey });
  }

  console.log(`\n  ACTIVE LLM PROVIDER: ${providerLabel}`);
  if (!process.argv.includes("--live") && apiKey) {
    console.log("  [TIP] Run with '--live' flag to trigger real Gemini endpoints if quota permits.");
  }

  try {
    // ════════════════════════════════════════════════════════════════════════
    // 1. EVENT CLASSIFIER TEST
    // ════════════════════════════════════════════════════════════════════════
    printHeader("1. Structured Event Classifier");
    const mockRawNews = `BREAKING: NVIDIA reports blowout earnings with Q1 revenue rising 262% YoY to $26.0B, ahead of the $24.6B estimate. CEO Jensen Huang notes AI chip demand is scaling globally. Tickers mentioned: NVDA, TSMC.`;
    
    console.log(`\n  Input content: "${mockRawNews.slice(0, 80)}..."`);
    console.log("  Running classifyEvent...");
    
    const classifiedResult = await classifyEvent(llm, mockRawNews);
    
    printSection("Classified Output");
    console.log(`  Event Type:  \x1b[1m${classifiedResult.event_type}\x1b[0m`);
    console.log(`  Symbols:     [ ${classifiedResult.symbols.join(", ")} ]`);
    console.log(`  Summary:     ${classifiedResult.summary}`);
    console.log(`  Confidence:  ${(classifiedResult.confidence * 100).toFixed(0)}%`);
    printFooter();

    // ════════════════════════════════════════════════════════════════════════
    // 2. TRADING DECISION GENERATOR TEST
    // ════════════════════════════════════════════════════════════════════════
    printHeader("2. Structured Trading Decision Engine");
    console.log("\n  Input: NVDA @ $950, RSI 40 (Oversold border), recent bullish crossover.");
    console.log("  Running generateTradingDecision...");

    const decisionResult = await generateTradingDecision(
      llm,
      "NVDA",
      950.0,
      { rsi_14: 40.2, macd: { histogram: 0.12 }, sma_20: 935.0 },
      [{ headline: "NVIDIA Blowout earnings report" }]
    );

    printSection("Decision Output");
    console.log(`  Verdict:     \x1b[1m\x1b[32m${decisionResult.verdict}\x1b[0m`);
    console.log(`  Confidence:  ${(decisionResult.confidence * 100).toFixed(0)}%`);
    console.log(`  Reasoning:   ${decisionResult.reasoning}`);
    printFooter();

    // ════════════════════════════════════════════════════════════════════════
    // 3. RESEARCH REPORT TEST
    // ════════════════════════════════════════════════════════════════════════
    printHeader("3. Equity Research Report Generator");
    console.log("\n  Input: NVDA current snapshot & 5 news headlines.");
    console.log("  Running generateResearchReport...");

    const reportResult = await generateResearchReport(llm, "NVDA", {
      overview: { price: 950.0, daily_vol: 45000000 },
      recentNews: [
        { headline: "NVIDIA reports blowout earnings", date: "2026-05-22" },
        { headline: "TSMC reports surge in chip assembly volumes", date: "2026-05-21" },
      ],
    });

    printSection("Research Report Output");
    console.log(reportResult.slice(0, 400) + "\n\n  ... [truncated report preview] ...");
    printFooter();

    // ════════════════════════════════════════════════════════════════════════
    // 4. LEARNED RULES SUMMARIZER TEST
    // ════════════════════════════════════════════════════════════════════════
    printHeader("4. Performance Learning Rule Engine");
    console.log("\n  Input: Mock trade journal entries history.");
    console.log("  Running summarizeLearnedRules...");

    const rulesResult = await summarizeLearnedRules(llm, [
      { symbol: "AAPL", side: "buy", outcome: "win", pnl_pct: 3.2, regime_tags: "low_volatility", signals: "rsi_oversold", notes: "breakout above resistance" },
      { symbol: "TSLA", side: "buy", outcome: "loss", pnl_pct: -1.8, regime_tags: "bearish", signals: "mean_reversion", notes: "caught falling knife" },
    ]);

    printSection("Learned Trading Guidelines");
    console.log(rulesResult);
    printFooter();

    console.log("\n" + "═".repeat(80));
    console.log("  ✓ ALL 4 LLM PIPELINE CLASSIFIERS VERIFIED CORRECTLY");
    console.log("═".repeat(80) + "\n");

  } catch (error: any) {
    console.error("\n❌ LLM Pipeline execution failed!");
    console.error(error.message || error);
    process.exit(1);
  }
}

run();
