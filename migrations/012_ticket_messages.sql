-- Ticket messages table
CREATE TABLE IF NOT EXISTS ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    direction TEXT NOT NULL,
    from_email TEXT NOT NULL,
    to_email TEXT NOT NULL,
    subject TEXT,
    body_html TEXT,
    body_text TEXT,
    resend_email_id TEXT,
    message_id TEXT,
    in_reply_to TEXT,
    references_header TEXT,
    has_attachments INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_direction ON ticket_messages(direction);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_message_id ON ticket_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created ON ticket_messages(created_at);
