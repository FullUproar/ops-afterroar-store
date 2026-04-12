-- ============================================================
-- Store Ops: Loyalty Points Ledger
-- Safe to run against FU production database.
-- Creates ONLY new pos_ prefixed table.
-- ============================================================

CREATE TABLE IF NOT EXISTS pos_loyalty_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES pos_customers(id),
  type TEXT NOT NULL,
  points INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  reference_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_loyalty_entries_store ON pos_loyalty_entries(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_loyalty_entries_customer ON pos_loyalty_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_loyalty_entries_store_date ON pos_loyalty_entries(store_id, created_at DESC);
