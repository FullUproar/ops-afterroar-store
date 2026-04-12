-- ============================================================
-- Store Ops: Returns & Refunds tables
-- Safe to run against FU production database.
-- Creates ONLY new pos_ prefixed tables.
-- Does NOT modify any existing tables.
-- FKs reference only pos_* tables.
-- ============================================================

-- POS Returns
CREATE TABLE IF NOT EXISTS pos_returns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES pos_customers(id),
  staff_id TEXT REFERENCES pos_staff(id),
  original_ledger_entry_id TEXT NOT NULL REFERENCES pos_ledger_entries(id),
  status TEXT NOT NULL DEFAULT 'completed',
  refund_method TEXT NOT NULL,
  reason TEXT NOT NULL,
  reason_notes TEXT,
  subtotal_cents INTEGER DEFAULT 0,
  restocking_fee_cents INTEGER DEFAULT 0,
  refund_amount_cents INTEGER DEFAULT 0,
  credit_bonus_percent NUMERIC(5,2) DEFAULT 0,
  total_refund_cents INTEGER DEFAULT 0,
  ledger_entry_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_returns_store ON pos_returns(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_returns_customer ON pos_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_returns_original ON pos_returns(original_ledger_entry_id);

-- POS Return Items
CREATE TABLE IF NOT EXISTS pos_return_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  return_id TEXT NOT NULL REFERENCES pos_returns(id) ON DELETE CASCADE,
  inventory_item_id TEXT REFERENCES pos_inventory_items(id),
  name TEXT NOT NULL,
  category TEXT,
  quantity INTEGER DEFAULT 1,
  price_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  restock BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
