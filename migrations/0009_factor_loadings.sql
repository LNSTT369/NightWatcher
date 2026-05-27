-- Migration 0009: Rolling ticker factor loadings for Fama-French exposures
CREATE TABLE IF NOT EXISTS factor_loadings (
    symbol TEXT PRIMARY KEY,
    beta_mkt REAL NOT NULL, -- Market Beta (Mkt-Rf)
    beta_smb REAL NOT NULL, -- Size Loading (SMB)
    beta_hml REAL NOT NULL, -- Value/Growth Loading (HML)
    updated_at TEXT NOT NULL
);

-- Daily historical factor returns database table (from Dartmouth Ken French library)
CREATE TABLE IF NOT EXISTS daily_factors (
    date TEXT PRIMARY KEY, -- YYYY-MM-DD
    mkt_rf REAL NOT NULL,
    smb REAL NOT NULL,
    hml REAL NOT NULL,
    rf REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_factors_date ON daily_factors(date);
