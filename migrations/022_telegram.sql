-- 022: Telegram bot integration (webhook logs, bot action logs, chat state)
--
-- webhook_logs           : raw incoming webhook payloads from both the Telegram
--                          bot webhook and the Resend email webhook (provider column).
-- telegram_bot_logs     : every action the bot performs or processes (commands,
--                          callbacks, notifications, replies) for auditability.
-- telegram_chat_state   : ephemeral per-chat multi-step state (e.g. reply flow)
--                          so a Telegram reply can never target the wrong ticket.

CREATE TABLE IF NOT EXISTS webhook_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_type TEXT,
  telegram_update_id INTEGER,
  chat_id INTEGER,
  source_ip TEXT,
  raw_payload TEXT NOT NULL,
  handled INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_provider ON webhook_logs(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_telegram_update ON webhook_logs(telegram_update_id);

CREATE TABLE IF NOT EXISTS telegram_bot_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction TEXT NOT NULL DEFAULT 'inbound',
  chat_id INTEGER,
  from_user INTEGER,
  update_id INTEGER,
  action TEXT NOT NULL,
  ticket_number TEXT,
  target TEXT,
  message TEXT,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  telegram_message_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_telegram_bot_logs_created ON telegram_bot_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_logs_action ON telegram_bot_logs(action);

CREATE TABLE IF NOT EXISTS telegram_chat_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL UNIQUE,
  action TEXT,
  ticket_id INTEGER,
  ticket_number TEXT,
  payload TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_telegram_chat_state_chat ON telegram_chat_state(chat_id);