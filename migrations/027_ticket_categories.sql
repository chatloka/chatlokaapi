-- Add category column to tickets (CodeCanyon-style support categories).
-- Values: pre_sale, installation, bug, customization, feature_request, license, billing, other
ALTER TABLE tickets ADD COLUMN category TEXT NOT NULL DEFAULT 'other';

-- Index for filtering tickets by category
CREATE INDEX idx_tickets_category ON tickets(category);
