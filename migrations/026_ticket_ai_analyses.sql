-- AI ticket analysis (initial triage: summary, category, priority, sentiment)
-- Triggered by a Cloudflare Workflow when a NEW ticket is created.
-- Status flow: pending -> processing -> completed | failed

CREATE TABLE IF NOT EXISTS ticket_ai_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  workflow_instance_id TEXT,
  model TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,

  -- Structured output fields (all filled on 'completed')
  summary TEXT,
  category TEXT,
  priority TEXT,
  sentiment TEXT,
  key_points TEXT,      -- JSON array of strings
  suggested_steps TEXT, -- JSON array of strings
  tags TEXT,            -- JSON array of strings
  confidence REAL,

  -- Guardrails
  injection_detected INTEGER NOT NULL DEFAULT 0,   -- model judgment (schema field)
  injection_evidence TEXT,                          -- model evidence string
  heuristic_injection INTEGER NOT NULL DEFAULT 0,   -- deterministic pattern scan
  refusal TEXT,                                     -- OpenAI refusal (if the model refused)

  -- Telemetry / cost
  prompt_chars INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  cost_usd REAL,

  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_ai_status ON ticket_ai_analyses(status);
