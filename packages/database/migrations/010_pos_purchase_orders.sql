CREATE TABLE IF NOT EXISTS pos_purchase_orders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  supplier_id TEXT REFERENCES pos_suppliers(id),
  supplier_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  order_date TIMESTAMPTZ DEFAULT NOW(),
  expected_delivery TIMESTAMPTZ,
  total_cost_cents INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pos_purchase_order_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  purchase_order_id TEXT NOT NULL REFERENCES pos_purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id TEXT REFERENCES pos_inventory_items(id),
  name TEXT NOT NULL,
  sku TEXT,
  quantity_ordered INT NOT NULL,
  quantity_received INT DEFAULT 0,
  cost_cents INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_po_store ON pos_purchase_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_po_status ON pos_purchase_orders(store_id, status);
