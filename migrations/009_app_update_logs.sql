-- App update logs table for tracking update attempts
CREATE TABLE IF NOT EXISTS app_update_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_code TEXT NOT NULL,
    domain TEXT NOT NULL,
    from_version TEXT NOT NULL,
    to_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    error_message TEXT,
    ip_address TEXT,
    user_agent TEXT,
    downloaded_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_app_update_logs_domain ON app_update_logs(domain);
CREATE INDEX IF NOT EXISTS idx_app_update_logs_purchase ON app_update_logs(purchase_code);
