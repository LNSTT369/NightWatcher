-- Migration 0010: Track loaded dynamic strategy repositories and backtest results
CREATE TABLE IF NOT EXISTS active_strategies (
    strategy_id TEXT PRIMARY KEY,
    provider_key_id TEXT NOT NULL,
    github_url TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL, -- "validated", "backtesting", "failed", "active"
    last_backtest_sharpe REAL,
    last_backtest_beta REAL,
    registered_at TEXT NOT NULL,
    FOREIGN KEY(provider_key_id) REFERENCES api_keys(key_id)
);

CREATE INDEX IF NOT EXISTS idx_active_strategies_provider ON active_strategies(provider_key_id);
