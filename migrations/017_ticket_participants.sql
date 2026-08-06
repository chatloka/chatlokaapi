-- Ticket participants (addresses allowed to join a ticket thread)
-- A sender in the original To/Cc/Bcc, or who has been included on the conversation,
-- is treated as a participant and may reply without being rejected.
CREATE TABLE IF NOT EXISTS ticket_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE (ticket_id, email)
);

CREATE INDEX IF NOT EXISTS idx_ticket_participants_ticket ON ticket_participants(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_participants_email ON ticket_participants(email);