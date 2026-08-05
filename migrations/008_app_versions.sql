-- App versions table for tracking application releases
CREATE TABLE IF NOT EXISTS app_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL UNIQUE,
    changelog TEXT,
    zip_path TEXT NOT NULL,
    checksum TEXT NOT NULL,
    file_size INTEGER,
    min_php_version TEXT DEFAULT '8.2',
    min_chatloka_version TEXT,
    breaking_changes TEXT,
    released_at TEXT,
    is_latest INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_versions_latest ON app_versions(is_latest);
CREATE INDEX IF NOT EXISTS idx_app_versions_released ON app_versions(released_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_versions_version ON app_versions(version);
