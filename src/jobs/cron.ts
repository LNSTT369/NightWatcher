import type { Env } from "../env.d";
import { createD1Client } from "../storage/d1/client";
import { createAlpacaProviders } from "../providers/alpaca";
import { resetDailyLoss, getRiskState } from "../storage/d1/queries/risk-state";
import { cleanupExpiredApprovals } from "../storage/d1/queries/approvals";
import {
  insertRawEvent,
  rawEventExists,
} from "../storage/d1/queries/events";
import { createSECEdgarProvider } from "../providers/news/sec-edgar";
import { cleanupExpiredSignals } from "../storage/d1/queries/signals";
import { createKVClient } from "../storage/kv/client";
import { getJournalReturns, getKellyInputs } from "../storage/d1/queries/risk_metrics";
import { calculateKelly } from "../risk/kelly";
import { calculateVaR } from "../risk/var";
import { calculateCorrelation } from "../risk/correlation";

export async function handleCronEvent(cronId: string, env: Env): Promise<void> {

  switch (cronId) {
    case "*/5 13-20 * * 1-5":
      await runEventIngestion(env);
      break;

    case "0 14 * * 1-5":
      await runMarketOpenPrep(env);
      break;

    case "30 21 * * 1-5":
      await runMarketCloseCleanup(env);
      break;

    case "0 5 * * *":
      await runMidnightReset(env);
      break;

    case "0 * * * *":
      await runHourlyCacheRefresh(env);
      break;

    default:
      console.log(`Unknown cron: ${cronId}`);
  }
}

async function runEventIngestion(env: Env): Promise<void> {
  console.log("Starting event ingestion...");

  const db = createD1Client(env.DB);
  const alpaca = createAlpacaProviders(env);

  try {
    const clock = await alpaca.trading.getClock();

    if (!clock.is_open) {
      console.log("Market closed, skipping event ingestion");
      return;
    }

    const riskState = await getRiskState(db);
    if (riskState.kill_switch_active) {
      console.log("Kill switch active, skipping event ingestion");
      return;
    }

    const secProvider = createSECEdgarProvider();
    const events = await secProvider.poll();

    let newEvents = 0;
    for (const event of events) {
      const exists = await rawEventExists(db, event.source, event.source_id);
      if (!exists) {
        await insertRawEvent(db, {
          source: event.source,
          source_id: event.source_id,
          raw_content: event.content,
        });
        newEvents++;
      }
    }

    console.log(`Event ingestion complete: ${newEvents} new events`);
  } catch (error) {
    console.error("Event ingestion error:", error);
  }
}

async function runMarketOpenPrep(env: Env): Promise<void> {
  console.log("Running market open prep...");

  const db = createD1Client(env.DB);

  try {
    const riskState = await getRiskState(db);
    console.log(`Risk state at open: kill_switch=${riskState.kill_switch_active}, daily_loss=${riskState.daily_loss_usd}`);

    const cleaned = await cleanupExpiredApprovals(db);
    console.log(`Cleaned up ${cleaned} expired approvals`);

  } catch (error) {
    console.error("Market open prep error:", error);
  }
}

async function runMarketCloseCleanup(env: Env): Promise<void> {
  console.log("Running market close cleanup...");

  const db = createD1Client(env.DB);
  const alpaca = createAlpacaProviders(env);

  try {
    const positions = await alpaca.trading.getPositions();
    const account = await alpaca.trading.getAccount();

    console.log(`End of day: ${positions.length} positions, equity=${account.equity}`);

    const cleaned = await cleanupExpiredApprovals(db);
    console.log(`Cleaned up ${cleaned} expired approvals`);

  } catch (error) {
    console.error("Market close cleanup error:", error);
  }
}

async function runMidnightReset(env: Env): Promise<void> {
  console.log("Running midnight reset...");

  const db = createD1Client(env.DB);

  try {
    await resetDailyLoss(db);
    console.log("Daily loss counter reset");

    const cleanedApprovals = await cleanupExpiredApprovals(db);
    console.log(`Cleaned up ${cleanedApprovals} expired approvals`);

    const cleanedSignals = await cleanupExpiredSignals(db);
    console.log(`Cleaned up ${cleanedSignals} stale signals`);

  } catch (error) {
    console.error("Midnight reset error:", error);
  }
}

async function runHourlyCacheRefresh(env: Env): Promise<void> {
  console.log("Running hourly cache refresh...");
  const db = createD1Client(env.DB);
  const alpaca = createAlpacaProviders(env);
  const kvClient = createKVClient(env.CACHE);

  try {
    const [account, positions] = await Promise.all([
      alpaca.trading.getAccount(),
      alpaca.trading.getPositions(),
    ]);

    // 1. Refresh Portfolio VaR
    const portfolioReturns = await getJournalReturns(db, undefined, 200);
    const varResult = calculateVaR({
      returns_pct: portfolioReturns,
      portfolio_value: account.equity,
      confidence: 0.95,
    });
    await kvClient.set(`nightwatcher:cache:var`, varResult, 86400);
    console.log(`Cached portfolio VaR: ${varResult.var_usd.toFixed(2)} USD`);

    // 2. Refresh Kelly and Correlations for active holdings
    for (const pos of positions) {
      const symbol = pos.symbol.toUpperCase();
      
      // Kelly Sizing
      const kellyInputs = await getKellyInputs(db, symbol, 200);
      if (kellyInputs) {
        const kellyResult = calculateKelly({
          win_rate: kellyInputs.win_rate,
          avg_win_pct: kellyInputs.avg_win_pct,
          avg_loss_pct: kellyInputs.avg_loss_pct,
          fraction_cap: 0.25,
        });
        await kvClient.set(`nightwatcher:cache:kelly:${symbol}`, kellyResult, 86400);
        console.log(`Cached Kelly for ${symbol}: ${kellyResult.recommended_pct_equity}%`);
      }

      // Correlations against other active holdings
      const returnsA = await getJournalReturns(db, symbol, 200);
      for (const otherPos of positions) {
        const otherSymbol = otherPos.symbol.toUpperCase();
        if (symbol === otherSymbol) continue;

        const returnsB = await getJournalReturns(db, otherSymbol, 200);
        const corr = calculateCorrelation({
          returns_a: returnsA,
          returns_b: returnsB,
          symbol_a: symbol,
          symbol_b: otherSymbol,
          threshold: 0.70,
        });
        await kvClient.set(`nightwatcher:cache:corr:${symbol}:${otherSymbol}`, corr, 86400);
      }
    }
    console.log("Hourly cache refresh completed successfully.");
  } catch (error) {
    console.error("Hourly cache refresh error:", error);
  }
}
