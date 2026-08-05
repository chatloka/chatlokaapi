-- Tickets table
CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_number TEXT NOT NULL UNIQUE,
    purchase_code TEXT,
    domain TEXT,
    from_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT DEFAULT 'normal',
    assigned_to TEXT,
    last_message_at TEXT,
    message_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_from_email ON tickets(from_email);
CREATE INDEX IF NOT EXISTS idx_tickets_purchase_code ON tickets(purchase_code);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_last_message ON tickets(last_message_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_number ON tickets(ticket_number);
