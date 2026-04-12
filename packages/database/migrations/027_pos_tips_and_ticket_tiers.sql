-- 027_pos_tips_and_ticket_tiers.sql
-- Tips on transactions + multi-tier event ticketing

-- Tips: track on ledger entries
ALTER TABLE pos_ledger_entries ADD COLUMN IF NOT EXISTS tip_cents INT DEFAULT 0;

-- Tip summary per staff per day (materialized by reporting, not a separate table —
-- we derive from ledger entries with tip_cents > 0)

-- Event ticket tiers
CREATE TABLE IF NOT EXISTS pos_event_ticket_tiers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id TEXT NOT NULL REFERENCES pos_events(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- "General Admission", "VIP", "Early Bird"
  description TEXT,
  price_cents INT NOT NULL DEFAULT 0,
  capacity INT, -- null = unlimited
  sold INT DEFAULT 0,
  sort_order INT DEFAULT 0,
  available_from TIMESTAMPTZ, -- null = immediately
  available_until TIMESTAMPTZ, -- null = until event starts
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track which tier a check-in used
ALTER TABLE pos_event_checkins ADD COLUMN IF NOT EXISTS ticket_tier_id TEXT REFERENCES pos_event_ticket_tiers(id);
ALTER TABLE pos_event_checkins ADD COLUMN IF NOT EXISTS amount_paid_cents INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pos_event_ticket_tiers_event ON pos_event_ticket_tiers(event_id);
