-- ============================================================
-- Store Ops: Multi-location, Inventory Levels, Transfers, Preorders
-- Safe to run against FU production database.
-- ============================================================

-- POS Locations
CREATE TABLE IF NOT EXISTS pos_locations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  type TEXT NOT NULL DEFAULT 'store',
  address JSONB,
  phone TEXT,
  active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, code)
);
CREATE INDEX IF NOT EXISTS idx_pos_locations_store ON pos_locations(store_id);

-- POS Inventory Levels (stock per item per location)
CREATE TABLE IF NOT EXISTS pos_inventory_levels (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL,
  inventory_item_id TEXT NOT NULL REFERENCES pos_inventory_items(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES pos_locations(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 0,
  reserved_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(inventory_item_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_levels_store ON pos_inventory_levels(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_levels_location ON pos_inventory_levels(location_id);

-- POS Transfers
CREATE TABLE IF NOT EXISTS pos_transfers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL,
  from_location_id TEXT NOT NULL REFERENCES pos_locations(id),
  to_location_id TEXT NOT NULL REFERENCES pos_locations(id),
  staff_id TEXT REFERENCES pos_staff(id),
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pos_transfers_store ON pos_transfers(store_id);

-- POS Preorders
CREATE TABLE IF NOT EXISTS pos_preorders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES pos_customers(id),
  location_id TEXT REFERENCES pos_locations(id),
  staff_id TEXT REFERENCES pos_staff(id),
  status TEXT NOT NULL DEFAULT 'pending',
  product_name TEXT NOT NULL,
  product_details JSONB DEFAULT '{}',
  quantity INTEGER DEFAULT 1,
  deposit_cents INTEGER DEFAULT 0,
  total_price_cents INTEGER DEFAULT 0,
  notes TEXT,
  release_date TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_preorders_store ON pos_preorders(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_preorders_status ON pos_preorders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_preorders_customer ON pos_preorders(customer_id);
