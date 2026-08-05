-- Ensure plugin_versions table exists with correct schema
CREATE TABLE IF NOT EXISTS plugin_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  version TEXT NOT NULL,
  changelog TEXT,
  zip_path TEXT NOT NULL,
  checksum TEXT,
  requires_chaton TEXT,
  released_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_latest INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Unique constraint for slug + version
  UNIQUE(slug, version)
);

-- Index for looking up latest version by slug
CREATE INDEX IF NOT EXISTS idx_plugin_versions_slug_latest ON plugin_versions(slug, is_latest);

-- Index for version lookups
CREATE INDEX IF NOT EXISTS idx_plugin_versions_slug_version ON plugin_versions(slug, version);

-- Index for release date ordering
CREATE INDEX IF NOT EXISTS idx_plugin_versions_released ON plugin_versions(released_at DESC);
