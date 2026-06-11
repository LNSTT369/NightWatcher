import type { Env } from "../env.d";
import { createD1Client } from "../storage/d1/client";
import { decryptText, encryptText } from "../lib/utils";

// ============================================================================
// GET /api/setup/status
// Checks if the user has completed initial setup (Alpaca keys saved).
// Returns: { ok: true, data: { configured: boolean } }
// ============================================================================

export async function handleSetupStatus(_request: Request, env: Env): Promise<Response> {
  try {
    const db = createD1Client(env.DB);

      // Check if any Alpaca keys have been stored — presence means setup is complete
    const row = await db.executeOne<{ alpaca_api_key: string }>(
       "SELECT alpaca_api_key FROM account_config WHERE id = 1 LIMIT 1"
     );

    const configured = row !== null && row.alpaca_api_key.trim().length > 0;

    return new Response(JSON.stringify({
      ok: true,
      data: { configured }
       }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
       });

     } catch (_err) {
       // If the table doesn't exist yet (pre-migration), treat as unconfigured
    return new Response(JSON.stringify({
      ok: true,
      data: { configured: false }
       }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
       });
     }
}

// ============================================================================
// POST /api/setup/keys
// Accepts Alpaca credentials + LLM settings + policy constraints.
// Encrypts keys with KILL_SWITCH_SECRET and stores in D1 account_config.
// This is the FIRST config call — no prior developer key required.
// ============================================================================

export async function handleSetupKeys(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as {
      alpaca_key: string;
      alpaca_secret: string;
      paper_mode?: boolean;
      starting_equity?: number;
        // LLM settings (optional)
      llm_provider?: 'openai' | 'gemini' | 'ollama';
      llm_key?: string;
      llm_url?: string;
        // Policy overrides (optional)
      policy?: {
        max_position_pct?: number;
        max_notional?: number;
        max_daily_loss_pct?: number;
       };
      };

       // Validate required fields
    if (!body.alpaca_key || !body.alpaca_secret) {
      return new Response(JSON.stringify({
        ok: false, error: "MISSING_FIELDS",
        message: "Alpaca API Key and Secret are required"
         }), { status: 400, headers: { "Content-Type": "application/json" } });
       }

    const secretKey = env.KILL_SWITCH_SECRET || "default-fallback-super-secret-key-123456";

       // Encrypt Alpaca keys and LLM key using AES-GCM
    const encryptedAlpacaKey = await encryptText(body.alpaca_key, secretKey);
    const encryptedAlpacaSecret = await encryptText(body.alpaca_secret, secretKey);
    const rawLlmKey = body.llm_key || (body as any).openai_key;
    const encryptedLlmKey = rawLlmKey ? await encryptText(rawLlmKey, secretKey) : '';

       // Build policy JSON from optional overrides
    const configJson = body.policy ? JSON.stringify({
      max_position_pct: body.policy.max_position_pct ?? 0.20,
      max_notional: body.policy.max_notional ?? 10000,
      max_daily_loss_pct: body.policy.max_daily_loss_pct ?? 0.02,
       }) : '{}';

    const now = new Date().toISOString();

       // Upsert the account_config row (first config — no existing key needed)
    await env.DB.prepare(`
      INSERT INTO account_config
        (id, alpaca_api_key, alpaca_api_secret, alpaca_paper, starting_equity,
         llm_provider, llm_key_encrypted, llm_url, config_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        alpaca_api_key = excluded.alpaca_api_key,
        alpaca_api_secret = excluded.alpaca_api_secret,
        alpaca_paper = excluded.alpaca_paper,
        starting_equity = excluded.starting_equity,
        llm_provider = excluded.llm_provider,
        llm_key_encrypted = excluded.llm_key_encrypted,
        llm_url = excluded.llm_url,
        config_json = excluded.config_json,
        configured = 1,
        updated_at = excluded.updated_at
      `).bind(
        1,                                          // id
        encryptedAlpacaKey,                         // alpaca_api_key (encrypted)
        encryptedAlpacaSecret,                      // alpaca_api_secret (encrypted)
        body.paper_mode === true ? 1 : 0,          // alpaca_paper
        body.starting_equity ?? 100000,           // starting_equity
        body.llm_provider ?? 'openai',             // llm_provider
        encryptedLlmKey,                            // llm_key_encrypted (encrypted)
        body.llm_url ?? '',                         // llm_url
        configJson,                                 // config_json
        now,                                        // updated_at
       ).run();

    return new Response(JSON.stringify({
      ok: true,
      message: "Account configuration saved. Alpaca credentials encrypted and stored."
       }), { status: 200, headers: { "Content-Type": "application/json" } });

     } catch (err) {
    console.error("handleSetupKeys error:", err);
    return new Response(JSON.stringify({
      ok: false, error: "INTERNAL_ERROR",
      message: String(err)
       }), { status: 500, headers: { "Content-Type": "application/json" } });
     }
}

// ============================================================================
// GET /api/status (V2) — Real data from D1-stored Alpaca keys
// Reads stored Alpaca credentials from D1 and checks the account.
// Falls back to mock data if no credentials are configured yet.
// This is the single endpoint that bridges onboarding → live trading.
// ============================================================================

export async function handleStatus(_request: Request, env: Env): Promise<Response> {
     // Support OPTIONS for CORS (dashboard is a separate origin)
    if (_request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
           "Access-Control-Allow-Origin": "*",
           "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
           "Access-Control-Allow-Headers": "Authorization, Content-Type",
         },
       });
      }

    const db = createD1Client(env.DB);
    const row = await db.executeOne<{
      alpaca_api_key: string;
      alpaca_api_secret: string;
      alpaca_paper: number;
      starting_equity: number;
      config_json: string;
     }>("SELECT * FROM account_config WHERE id = 1 LIMIT 1");

       // No credentials stored → return mock data for onboarding preview
    if (!row || !row.alpaca_api_key.trim()) {
      return new Response(JSON.stringify({
        ok: true,
        data: {
          account: null,
          positions: [],
          config: null,
          clock: { is_open: false },
          costs: { total_usd: 0, calls: 0 },
         }
       }), {
        status: 200,
        headers: {
           "Content-Type": "application/json",
           "Access-Control-Allow-Origin": "*",
         },
       });
      }

       // Decrypt Alpaca credentials and check real account
    try {
      const secretKey = env.KILL_SWITCH_SECRET || "default-fallback-super-secret-key-123456";
      const apiKey = await decryptText(row.alpaca_api_key, secretKey);
      const apiSecret = await decryptText(row.alpaca_api_secret, secretKey);
      const paperMode = row.alpaca_paper === 1;

          // Fetch account data from Alpaca
      const accountRes = await fetch(
        `https://${paperMode ? 'paper-api' : 'api'}.alpaca.markets/v2/account`,
         {
           headers: {
             "Accept": "application/json",
             "APCA-API-KEY-ID": apiKey,
             "APCA-API-SECRET-KEY": apiSecret
           }
         }
       );

      if (!accountRes.ok) {
        console.error("Alpaca /account failed:", accountRes.status);
        return new Response(JSON.stringify({
          ok: false, error: "ALPACA_CONNECTION_FAILED",
          message: `Failed to connect to Alpaca (${paperMode ? 'paper' : 'live'}). Check your API keys.`
         }), { status: 200 });
       }

      const account = await accountRes.json();
        // Parse policy config from D1 (defaults to safe values)
      let parsedConfig;
      try { parsedConfig = JSON.parse(row.config_json || '{}'); } catch { parsedConfig = {}; }

      return new Response(JSON.stringify({
        ok: true,
        data: {
          account,
          positions: [], // Fetched separately via /api/positions
          config: {
            starting_equity: row.starting_equity,
            paper_mode: paperMode,
             ...parsedConfig,
           },
          clock: { is_open: true },
          costs: { total_usd: 0, calls: 0 },
         }
       }), {
        status: 200,
        headers: {
           "Content-Type": "application/json",
           "Access-Control-Allow-Origin": "*",
         },
       });

      } catch (err) {
      console.error("handleStatus error:", err);
      return new Response(JSON.stringify({
        ok: false, error: "INTERNAL_ERROR",
        message: String(err)
       }), { status: 200 }); // Return 200 so dashboard sees it and retries
      }
}
