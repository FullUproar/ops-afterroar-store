-- Customer tags and notes for community profiles
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

CREATE TABLE IF NOT EXISTS pos_customer_notes (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES pos_customers(id) ON DELETE CASCADE,
  staff_name  TEXT,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_customer_notes_customer
  ON pos_customer_notes(customer_id, created_at DESC);
