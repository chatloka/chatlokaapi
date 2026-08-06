-- Ensure the single-use JWT token ledger exists for plugin downloads,
-- ticket attachment downloads and File Manager downloads/uploads.
CREATE TABLE IF NOT EXISTS used_tokens (
  jti TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);
