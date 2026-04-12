-- Federated product catalog (shared across network)
CREATE TABLE IF NOT EXISTS pos_catalog_products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  game TEXT,
  product_type TEXT,
  set_name TEXT,
  set_code TEXT,
  attributes JSONB DEFAULT '{}',
  external_ids JSONB DEFAULT '{}',
  image_url TEXT,
  description TEXT,
  contributed_by_store_id TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_catalog_category ON pos_catalog_products(category);
CREATE INDEX IF NOT EXISTS idx_pos_catalog_game ON pos_catalog_products(game);
-- Note: pg_trgm not available on this DB. Using btree index instead.
CREATE INDEX IF NOT EXISTS idx_pos_catalog_name ON pos_catalog_products(name);

-- Category navigation tree
CREATE TABLE IF NOT EXISTS pos_catalog_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  parent_id TEXT REFERENCES pos_catalog_categories(id),
  icon TEXT,
  sort_order INT DEFAULT 0,
  level INT DEFAULT 0,
  product_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_cat_parent ON pos_catalog_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_pos_cat_slug ON pos_catalog_categories(slug);

-- Network pricing intelligence (opt-in per store)
CREATE TABLE IF NOT EXISTS pos_catalog_pricing (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  catalog_product_id TEXT NOT NULL REFERENCES pos_catalog_products(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  last_sale_price_cents INT,
  last_sale_date TIMESTAMPTZ,
  avg_sale_price_cents INT,
  velocity_per_week NUMERIC(10,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(catalog_product_id, store_id)
);

-- Add catalog link to inventory items
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS catalog_product_id TEXT REFERENCES pos_catalog_products(id);
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS shared_to_catalog BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_pos_inv_catalog ON pos_inventory_items(catalog_product_id) WHERE catalog_product_id IS NOT NULL;
