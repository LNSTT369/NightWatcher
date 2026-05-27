-- Migration 0008: Multi-tenant API keys for providers
CREATE TABLE IF NOT EXISTS api_keys (
    key_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    default_source TEXT NOT NULL,
    credibility_weight REAL NOT NULL,
    rate_limit_rpm INTEGER DEFAULT 60,
    created_at TEXT NOT NULL,
    revoked INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(token_hash);
