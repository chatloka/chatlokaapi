-- Flag automated system messages (e.g. auto-acknowledgment on new ticket)
ALTER TABLE ticket_messages ADD COLUMN is_automated INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ticket_messages_automated ON ticket_messages(is_automated);