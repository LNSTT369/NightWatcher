-- Migration 0011: Seed active Quant Code Automata developer partner API key
INSERT INTO api_keys (key_id, token_hash, provider_name, default_source, credibility_weight, rate_limit_rpm, created_at, revoked)
VALUES (
    'qca-dev-partner',
    'qca-secret-token-1234',
    'Quant Code Automata Developer',
    'external',
    0.90,
    60,
    '2026-05-27T19:13:00Z',
    0
)
ON CONFLICT(key_id) DO UPDATE SET token_hash = excluded.token_hash, credibility_weight = excluded.credibility_weight;
