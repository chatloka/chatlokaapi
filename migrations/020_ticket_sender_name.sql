-- Sender display name for ticket owners, parsed from the From: header
-- of the received email (e.g. "John Doe <john@example.com>" -> "John Doe").
-- Used for personalized greetings in automated replies and shown in the admin UI.
ALTER TABLE tickets ADD COLUMN from_name TEXT;
