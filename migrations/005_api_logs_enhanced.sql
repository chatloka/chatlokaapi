-- Enhanced API logs table for comprehensive request tracking
-- Drop existing table if it exists (D1 doesn't support IF NOT EXISTS for all table operations)
DROP TABLE IF EXISTS api_logs;

CREATE TABLE api_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Request info
  method TEXT NOT NULL,              -- GET, POST, PUT, DELETE
  endpoint TEXT NOT NULL,            -- /api/activate, /api/validate, etc.
  -- Client info
  ip_address TEXT,                   -- Client IP (cf-connecting-ip)
  user_agent TEXT,                   -- Client user agent
  purchase_code TEXT,                -- Extracted from body if available
  domain TEXT,                       -- Extracted from body if available
  -- Response info
  status_code INTEGER NOT NULL,      -- HTTP status code
  response_time_ms INTEGER NOT NULL, -- Total response time
  envato_time_ms INTEGER,            -- Time spent calling Envato API
  -- Request body size
  request_size_bytes INTEGER,        -- Size of request body
  -- Error info
  error_message TEXT,                -- Error message if status >= 400
  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Indexes for common queries
  UNIQUE(id)
);

-- Index for time-based queries (most common)
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at DESC);

-- Index for endpoint filtering
CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON api_logs(endpoint);

-- Index for status code filtering
CREATE INDEX IF NOT EXISTS idx_api_logs_status ON api_logs(status_code);

-- Index for IP-based queries
CREATE INDEX IF NOT EXISTS idx_api_logs_ip ON api_logs(ip_address);

-- Composite index for endpoint + time queries
CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint_time ON api_logs(endpoint, created_at DESC);
