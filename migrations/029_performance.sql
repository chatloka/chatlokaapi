-- Performance: composite index for "latest purchase" lookups (P1-4).
-- Serves the correlated subqueries in the ticket and contact listings that
-- resolve each contact's newest purchase (ORDER BY support_until DESC, id DESC)
-- in src/services/ticket.ts getTicketsPaginated and src/services/contact.ts
-- getContactsPaginated. Columns verified against migrations/021_contacts.sql.
CREATE INDEX IF NOT EXISTS idx_contact_purchases_contact_support
  ON contact_purchases(contact_id, support_until DESC, id DESC);
