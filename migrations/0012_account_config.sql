-- Migration 0012: Per-user account configuration storage
-- Stores encrypted Alpaca credentials, LLM settings, and policy constraints
CREATE TABLE IF NOT EXISTS account_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),

    -- Alpaca trading credentials (encrypted with KILL_SWITCH_SECRET)
    alpaca_api_key TEXT NOT NULL DEFAULT '',
    alpaca_api_secret TEXT NOT NULL DEFAULT '',
    alpaca_paper INTEGER NOT NULL DEFAULT 1,           -- 1 = paper trading, 0 = live

    -- Configuration state
    starting_equity REAL NOT NULL DEFAULT 100000,       -- user's initial portfolio equity
    configured INTEGER NOT NULL DEFAULT 0,              -- 1 = setup complete, 0 = needs onboarding

    -- LLM provider settings (encrypted with KILL_SWITCH_SECRET)
    llm_provider TEXT NOT NULL DEFAULT 'openai',        -- "openai" | "gemini" | "ollama" | "auto"
    llm_key_encrypted TEXT NOT NULL DEFAULT '',
    llm_url TEXT NOT NULL DEFAULT '',

    -- Policy constraints (default values, can be overridden in D1)
    config_json TEXT NOT NULL DEFAULT '{}',              -- JSON with policy overrides

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed the config row on first migration
INSERT OR IGNORE INTO account_config (id) VALUES (1);
