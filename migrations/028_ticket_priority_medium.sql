-- Normalize ticket priority. The DB default was 'normal', but the supported
-- enum everywhere else (UI, AI triage, MCP) is low/medium/high.
-- 'medium' is the neutral default before AI triage runs.
UPDATE tickets SET priority = 'medium'
WHERE priority = 'normal' OR priority IS NULL OR priority = '';
