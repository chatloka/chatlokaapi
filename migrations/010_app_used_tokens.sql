-- App used tokens table for single-use download tokens
CREATE TABLE IF NOT EXISTS app_used_tokens (
    jti TEXT PRIMARY KEY,
    used_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);
