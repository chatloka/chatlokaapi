-- Notifications table (admin notification feed)
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    ticket_id INTEGER,
    ticket_number TEXT,
    subject TEXT,
    from_email TEXT,
    direction TEXT,
    summary TEXT,
    read_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_ticket ON notifications(ticket_id);