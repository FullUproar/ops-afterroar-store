-- ============================================================
-- Afterroar Store Ops — Initial Schema
-- Multi-tenant POS for friendly local game stores
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- STORES
-- ============================================================
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  address JSONB,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STAFF
-- ============================================================
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'cashier')),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, store_id)
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  credit_balance_cents INTEGER DEFAULT 0,
  notes TEXT,
  afterroar_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_store ON customers (store_id);
CREATE INDEX idx_customers_name_trgm ON customers USING GIN (name gin_trgm_ops);

-- ============================================================
-- INVENTORY ITEMS (Hybrid SKU model)
-- ============================================================
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'tcg_single', 'sealed', 'board_game', 'miniature',
    'accessory', 'food_drink', 'other'
  )),
  sku TEXT,
  barcode TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  attributes JSONB DEFAULT '{}',
  image_url TEXT,
  external_id TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_store ON inventory_items (store_id);
CREATE INDEX idx_inventory_attributes ON inventory_items USING GIN (attributes);
CREATE INDEX idx_inventory_name_trgm ON inventory_items USING GIN (name gin_trgm_ops);
CREATE INDEX idx_inventory_barcode ON inventory_items (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_inventory_category ON inventory_items (store_id, category);
CREATE INDEX idx_inventory_sku ON inventory_items (store_id, sku) WHERE sku IS NOT NULL;

-- ============================================================
-- EVENTS
-- ============================================================
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  event_type TEXT CHECK (event_type IN (
    'fnm', 'prerelease', 'tournament', 'casual', 'draft', 'league', 'other'
  )),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  entry_fee_cents INTEGER DEFAULT 0,
  max_players INTEGER,
  afterroar_event_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_store ON events (store_id);
CREATE INDEX idx_events_date ON events (store_id, starts_at DESC);

-- ============================================================
-- IMMUTABLE LEDGER
-- ============================================================
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'sale', 'trade_in', 'credit_issue', 'credit_redeem',
    'adjustment', 'event_fee'
  )),
  customer_id UUID REFERENCES customers(id),
  staff_id UUID REFERENCES staff(id),
  event_id UUID REFERENCES events(id),
  amount_cents INTEGER NOT NULL,
  credit_amount_cents INTEGER DEFAULT 0,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ledger_store ON ledger_entries (store_id);
CREATE INDEX idx_ledger_customer ON ledger_entries (customer_id);
CREATE INDEX idx_ledger_type ON ledger_entries (store_id, type);
CREATE INDEX idx_ledger_created ON ledger_entries (store_id, created_at DESC);
CREATE INDEX idx_ledger_event ON ledger_entries (event_id) WHERE event_id IS NOT NULL;

-- ============================================================
-- TRADE-INS
-- ============================================================
CREATE TABLE trade_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  staff_id UUID REFERENCES staff(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'rejected', 'completed'
  )),
  payout_type TEXT CHECK (payout_type IN ('cash', 'credit')),
  total_offer_cents INTEGER DEFAULT 0,
  credit_bonus_percent NUMERIC(5,2) DEFAULT 0,
  total_payout_cents INTEGER DEFAULT 0,
  notes TEXT,
  ledger_entry_id UUID REFERENCES ledger_entries(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_trade_ins_store ON trade_ins (store_id);
CREATE INDEX idx_trade_ins_customer ON trade_ins (customer_id);
CREATE INDEX idx_trade_ins_status ON trade_ins (store_id, status);

CREATE TABLE trade_in_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_in_id UUID REFERENCES trade_ins(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id),
  name TEXT NOT NULL,
  category TEXT,
  attributes JSONB DEFAULT '{}',
  quantity INTEGER DEFAULT 1,
  market_price_cents INTEGER,
  offer_price_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trade_in_items ON trade_in_items (trade_in_id);

-- ============================================================
-- EVENT CHECK-INS
-- ============================================================
CREATE TABLE event_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  fee_paid BOOLEAN DEFAULT FALSE,
  ledger_entry_id UUID REFERENCES ledger_entries(id),
  UNIQUE(event_id, customer_id)
);

CREATE INDEX idx_checkins_event ON event_checkins (event_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_in_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_checkins ENABLE ROW LEVEL SECURITY;

-- Helper: get store IDs for current user
CREATE OR REPLACE FUNCTION user_store_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT store_id FROM staff WHERE user_id = auth.uid() AND active = TRUE;
$$;

-- Stores
CREATE POLICY stores_select ON stores FOR SELECT USING (id IN (SELECT user_store_ids()));
CREATE POLICY stores_update ON stores FOR UPDATE USING (id IN (SELECT user_store_ids()));

-- Staff
CREATE POLICY staff_select ON staff FOR SELECT USING (store_id IN (SELECT user_store_ids()));
CREATE POLICY staff_insert ON staff FOR INSERT WITH CHECK (store_id IN (SELECT user_store_ids()));
CREATE POLICY staff_update ON staff FOR UPDATE USING (store_id IN (SELECT user_store_ids()));

-- Customers
CREATE POLICY customers_all ON customers FOR ALL USING (store_id IN (SELECT user_store_ids()));

-- Inventory
CREATE POLICY inventory_all ON inventory_items FOR ALL USING (store_id IN (SELECT user_store_ids()));

-- Ledger (insert + select only — immutable)
CREATE POLICY ledger_select ON ledger_entries FOR SELECT USING (store_id IN (SELECT user_store_ids()));
CREATE POLICY ledger_insert ON ledger_entries FOR INSERT WITH CHECK (store_id IN (SELECT user_store_ids()));

-- Trade-ins
CREATE POLICY trade_ins_all ON trade_ins FOR ALL USING (store_id IN (SELECT user_store_ids()));
CREATE POLICY trade_in_items_all ON trade_in_items FOR ALL USING (
  trade_in_id IN (SELECT id FROM trade_ins WHERE store_id IN (SELECT user_store_ids()))
);

-- Events
CREATE POLICY events_all ON events FOR ALL USING (store_id IN (SELECT user_store_ids()));
CREATE POLICY checkins_all ON event_checkins FOR ALL USING (
  event_id IN (SELECT id FROM events WHERE store_id IN (SELECT user_store_ids()))
);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stores_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER inventory_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
