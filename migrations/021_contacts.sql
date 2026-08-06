-- Contact (person) registry keyed by sender email. A "contact" is anyone who
-- has ever emailed support. `type` is 'lead' (never purchased / no purchase
-- code on file) or 'customer' (has at least one valid purchase code).
CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    type TEXT NOT NULL DEFAULT 'lead' CHECK (type IN ('lead', 'customer')),
    first_contact_at TEXT,
    last_contact_at TEXT,
    total_tickets INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);

-- One row per purchase code the person owns. A single contact can hold many
-- purchases (e.g. multiple item buys or support renewals). Support timeframe
-- (supported_until) follows the official CodeCanyon Item Support Policy:
-- 6 months included on purchase, extendable up to 12 months, renewals +6 months.
CREATE TABLE IF NOT EXISTS contact_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    purchase_code TEXT NOT NULL UNIQUE,
    license_type TEXT NOT NULL CHECK (license_type IN ('regular', 'extended')),
    item_name TEXT,
    purchase_date TEXT,
    support_until TEXT,
    support_term_months INTEGER,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('envato', 'manual')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_purchases_contact ON contact_purchases(contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_purchases_code ON contact_purchases(purchase_code);

-- Link tickets to the contact that owns them.
ALTER TABLE tickets ADD COLUMN contact_id INTEGER REFERENCES contacts(id);
CREATE INDEX IF NOT EXISTS idx_tickets_contact ON tickets(contact_id);

-- Backfill: create a contact row for every distinct sender we already have on
-- file, then attach the FK so existing tickets show the right contact/lead.
INSERT OR IGNORE INTO contacts (email, name, type, first_contact_at, last_contact_at, total_tickets, created_at)
SELECT
    LOWER(TRIM(t.from_email)),
    MAX(t.from_name),
    'lead',
    MIN(t.created_at),
    MAX(t.created_at),
    COUNT(*),
    datetime('now')
FROM tickets t
WHERE LOWER(TRIM(t.from_email)) != ''
GROUP BY LOWER(TRIM(t.from_email));

UPDATE tickets
SET contact_id = (
    SELECT c.id FROM contacts c
    WHERE c.email = LOWER(TRIM(tickets.from_email))
)
WHERE LOWER(TRIM(from_email)) != '';