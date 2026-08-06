-- 023: Add duration_ms to webhook_logs for per-webhook latency tracking.
ALTER TABLE webhook_logs ADD COLUMN duration_ms INTEGER;
