-- 014_pos_shipping.sql
-- Orders and fulfillment/shipping tables

CREATE TABLE IF NOT EXISTS pos_orders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES pos_customers(id),
  order_number TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'pos',
  status TEXT NOT NULL DEFAULT 'pending',
  subtotal_cents INT DEFAULT 0,
  tax_cents INT DEFAULT 0,
  shipping_cents INT DEFAULT 0,
  discount_cents INT DEFAULT 0,
  total_cents INT DEFAULT 0,
  shipping_method TEXT,
  shipping_address JSONB,
  tracking_number TEXT,
  tracking_url TEXT,
  notes TEXT,
  ledger_entry_id TEXT,
  fulfilled_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_order_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id TEXT NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  inventory_item_id TEXT REFERENCES pos_inventory_items(id),
  name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  price_cents INT NOT NULL,
  total_cents INT NOT NULL,
  fulfilled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_orders_store ON pos_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_status ON pos_orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_orders_number ON pos_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_pos_order_items_order ON pos_order_items(order_id);
