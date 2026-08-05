-- Ticket attachments table
CREATE TABLE IF NOT EXISTS ticket_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_message_id INTEGER NOT NULL,
    ticket_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    file_size INTEGER,
    r2_path TEXT NOT NULL,
    resend_attachment_id TEXT,
    content_id TEXT,
    content_disposition TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_message ON ticket_attachments(ticket_message_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id);
