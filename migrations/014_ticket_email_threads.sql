-- Ticket email threads table
CREATE TABLE IF NOT EXISTS ticket_email_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    message_id TEXT NOT NULL,
    parent_message_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_threads_ticket ON ticket_email_threads(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_threads_message_id ON ticket_email_threads(message_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_threads_msg_unique ON ticket_email_threads(message_id);
