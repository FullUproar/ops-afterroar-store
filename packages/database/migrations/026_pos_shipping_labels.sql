-- 026_pos_shipping_labels.sql
-- Expand orders for shipping + shipping labels table

-- Add shipping-specific columns to pos_orders
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS shipping_carrier TEXT;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS estimated_delivery TIMESTAMPTZ;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS label_url TEXT;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS weight_oz INT;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS ship_date TIMESTAMPTZ;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'unfulfilled'; -- unfulfilled, picking, packed, shipped, delivered
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS fulfillment_type TEXT DEFAULT 'merchant'; -- merchant (self-fulfill), pod (print-on-demand), 3pl (third-party logistics)

-- Per-item fulfillment type (some items in an order may be POD, others merchant)
ALTER TABLE pos_order_items ADD COLUMN IF NOT EXISTS fulfillment_type TEXT DEFAULT 'merchant';
ALTER TABLE pos_order_items ADD COLUMN IF NOT EXISTS fulfillment_provider TEXT; -- e.g. "printful", "shipbob", specific 3PL name

-- Shipping labels (one order can have multiple labels / multi-box)
CREATE TABLE IF NOT EXISTS pos_shipping_labels (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  shipstation_shipment_id TEXT,
  carrier_code TEXT NOT NULL,
  service_code TEXT NOT NULL,
  tracking_number TEXT,
  tracking_url TEXT,
  label_data TEXT, -- base64 PDF
  label_format TEXT DEFAULT 'pdf',
  shipment_cost_cents INT DEFAULT 0,
  other_cost_cents INT DEFAULT 0,
  weight_oz INT,
  length_in DECIMAL(5,1),
  width_in DECIMAL(5,1),
  height_in DECIMAL(5,1),
  ship_date TIMESTAMPTZ,
  voided BOOLEAN DEFAULT FALSE,
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Packaging types for box selection
CREATE TABLE IF NOT EXISTS pos_packaging_types (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  length_in DECIMAL(5,1) NOT NULL,
  width_in DECIMAL(5,1) NOT NULL,
  height_in DECIMAL(5,1) NOT NULL,
  material TEXT DEFAULT 'cardboard',
  weight_oz INT DEFAULT 0, -- tare weight of the box itself
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-item shipping attributes on inventory items
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS weight_oz INT;
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS length_in DECIMAL(5,1);
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS width_in DECIMAL(5,1);
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS height_in DECIMAL(5,1);
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS ships_separately BOOLEAN DEFAULT FALSE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pos_shipping_labels_store ON pos_shipping_labels(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_shipping_labels_order ON pos_shipping_labels(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_shipping_labels_tracking ON pos_shipping_labels(tracking_number);
CREATE INDEX IF NOT EXISTS idx_pos_packaging_types_store ON pos_packaging_types(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_fulfillment ON pos_orders(store_id, fulfillment_status);
