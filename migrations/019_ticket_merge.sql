-- Ticket merge support
-- A ticket can be merged into another ticket: all messages, attachments,
-- email threads, and participants are moved to the target ticket, and the
-- source ticket is marked as merged (kept for audit, hidden from default lists).
ALTER TABLE tickets ADD COLUMN merged_into INTEGER;
ALTER TABLE tickets ADD COLUMN merged_at TEXT;

CREATE INDEX IF NOT EXISTS idx_tickets_merged_into ON tickets(merged_into);
