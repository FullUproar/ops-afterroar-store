-- ============================================================
-- Store Ops: Initial pos_* tables
-- Safe to run against FU production database.
-- Creates ONLY new pos_ prefixed tables.
-- Does NOT modify any existing tables.
-- Only cross-reference: pos_staff.user_id → "User".id
-- ============================================================

-- POS Stores
CREATE TABLE IF NOT EXISTS pos_stores (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id TEXT,
  address JSONB,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- POS Staff (bridge to HQ User table)
CREATE TABLE IF NOT EXISTS pos_staff (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'cashier',
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, store_id)
);

-- POS Customers
CREATE TABLE IF NOT EXISTS pos_customers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  credit_balance_cents INTEGER DEFAULT 0,
  loyalty_points INTEGER DEFAULT 0,
  notes TEXT,
  afterroar_user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_customers_store ON pos_customers(store_id);

-- POS Inventory Items
CREATE TABLE IF NOT EXISTS pos_inventory_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  price_cents INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  quantity INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  attributes JSONB DEFAULT '{}',
  image_url TEXT,
  external_id TEXT,
  supplier_id TEXT,
  lead_time_days INTEGER,
  reorder_point INTEGER,
  safety_stock INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_store ON pos_inventory_items(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_category ON pos_inventory_items(store_id, category);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_barcode ON pos_inventory_items(barcode);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_sku ON pos_inventory_items(store_id, sku);

-- POS Suppliers
CREATE TABLE IF NOT EXISTS pos_suppliers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT,
  default_lead_time_days INTEGER DEFAULT 14,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK from inventory to suppliers
ALTER TABLE pos_inventory_items
  ADD CONSTRAINT fk_pos_inventory_supplier
  FOREIGN KEY (supplier_id) REFERENCES pos_suppliers(id);

-- POS Events
CREATE TABLE IF NOT EXISTS pos_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  event_type TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  entry_fee_cents INTEGER DEFAULT 0,
  max_players INTEGER,
  afterroar_event_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_events_store ON pos_events(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_events_date ON pos_events(store_id, starts_at DESC);

-- POS Event Checkins
CREATE TABLE IF NOT EXISTS pos_event_checkins (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id TEXT NOT NULL REFERENCES pos_events(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES pos_customers(id),
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  fee_paid BOOLEAN DEFAULT FALSE,
  ledger_entry_id TEXT,
  UNIQUE(event_id, customer_id)
);

-- POS Ledger (immutable)
CREATE TABLE IF NOT EXISTS pos_ledger_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  customer_id TEXT REFERENCES pos_customers(id),
  staff_id TEXT REFERENCES pos_staff(id),
  event_id TEXT REFERENCES pos_events(id),
  amount_cents INTEGER NOT NULL,
  credit_amount_cents INTEGER DEFAULT 0,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_ledger_store ON pos_ledger_entries(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_ledger_customer ON pos_ledger_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_ledger_type ON pos_ledger_entries(store_id, type);
CREATE INDEX IF NOT EXISTS idx_pos_ledger_created ON pos_ledger_entries(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_ledger_event ON pos_ledger_entries(event_id);

-- POS Trade-Ins
CREATE TABLE IF NOT EXISTS pos_trade_ins (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES pos_customers(id),
  staff_id TEXT REFERENCES pos_staff(id),
  status TEXT NOT NULL DEFAULT 'pending',
  payout_type TEXT,
  total_offer_cents INTEGER DEFAULT 0,
  credit_bonus_percent NUMERIC(5,2) DEFAULT 0,
  total_payout_cents INTEGER DEFAULT 0,
  notes TEXT,
  ledger_entry_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pos_trade_ins_store ON pos_trade_ins(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_trade_ins_customer ON pos_trade_ins(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_trade_ins_status ON pos_trade_ins(store_id, status);

-- POS Trade-In Items
CREATE TABLE IF NOT EXISTS pos_trade_in_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  trade_in_id TEXT NOT NULL REFERENCES pos_trade_ins(id) ON DELETE CASCADE,
  inventory_item_id TEXT REFERENCES pos_inventory_items(id),
  name TEXT NOT NULL,
  category TEXT,
  attributes JSONB DEFAULT '{}',
  quantity INTEGER DEFAULT 1,
  market_price_cents INTEGER,
  offer_price_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- POS Gift Cards
CREATE TABLE IF NOT EXISTS pos_gift_cards (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  balance_cents INTEGER DEFAULT 0,
  initial_balance_cents INTEGER DEFAULT 0,
  purchased_by_customer_id TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
