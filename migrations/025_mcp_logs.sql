-- MCP request/response audit logs
CREATE TABLE IF NOT EXISTS mcp_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  tool TEXT,
  params TEXT,
  response TEXT,
  is_error INTEGER NOT NULL DEFAULT 0,
  status_code INTEGER,
  duration_ms INTEGER,
  client_name TEXT,
  client_version TEXT,
  session_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mcp_logs_created ON mcp_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_logs_tool ON mcp_logs(tool);
CREATE INDEX IF NOT EXISTS idx_mcp_logs_method ON mcp_logs(method);
