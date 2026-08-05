-- Ticket analytics: response-time tracking
ALTER TABLE tickets ADD COLUMN first_response_at TEXT;
ALTER TABLE tickets ADD COLUMN first_response_minutes INTEGER;
ALTER TABLE tickets ADD COLUMN admin_last_seen_at TEXT;

ALTER TABLE ticket_messages ADD COLUMN response_minutes INTEGER;