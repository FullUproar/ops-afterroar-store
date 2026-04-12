CREATE TABLE IF NOT EXISTS pos_stock_counts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  staff_id TEXT REFERENCES pos_staff(id),
  status TEXT NOT NULL DEFAULT 'in_progress',
  category_filter TEXT,
  location_filter TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_items INT DEFAULT 0,
  variances INT DEFAULT 0,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS pos_stock_count_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  stock_count_id TEXT NOT NULL REFERENCES pos_stock_counts(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES pos_inventory_items(id),
  system_quantity INT NOT NULL,
  counted_quantity INT,
  variance INT GENERATED ALWAYS AS (COALESCE(counted_quantity, 0) - system_quantity) STORED,
  counted_at TIMESTAMPTZ,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_pos_sc_store ON pos_stock_counts(store_id);
