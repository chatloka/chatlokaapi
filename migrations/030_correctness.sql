-- 030: Correctness hardening (idempotency + dedupe)
--
-- (a) Resend webhook idempotency: the webhook may redeliver the same event.
--     Dedupe existing duplicates (keep the FIRST row per resend_email_id),
--     then lock it down with a UNIQUE index. NULL resend_email_id values are
--     distinct in SQLite unique indexes, so pre-existing NULL rows (e.g.
--     outbound messages stored before the send) are unaffected.
DELETE FROM ticket_messages
WHERE resend_email_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM ticket_messages
    WHERE resend_email_id IS NOT NULL
    GROUP BY resend_email_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_messages_resend_email_id
  ON ticket_messages(resend_email_id);

-- (b) Telegram update_id dedupe ledger: Telegram redelivers an update when the
--     webhook does not respond in time. The bot inserts the update_id before
--     processing (INSERT OR IGNORE) so a redelivered update is skipped.
CREATE TABLE IF NOT EXISTS telegram_processed_updates (
    update_id INTEGER PRIMARY KEY,
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- (c) Admin reply idempotency: clients may send an X-Idempotency-Key /
--     idempotency_key with a reply; a retried request must not send the email
--     twice. Stored on the outbound message row, enforced with a UNIQUE index.
ALTER TABLE ticket_messages ADD COLUMN client_idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_messages_client_idempotency_key
  ON ticket_messages(client_idempotency_key);
