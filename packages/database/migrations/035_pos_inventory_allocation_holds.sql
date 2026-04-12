-- 035: Inventory allocation for Shopify sync + in-store holds
-- Enables omnichannel: Store Ops = source of truth, Shopify = online window

-- Allocation fields on inventory items
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS online_allocation INT DEFAULT 0;
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT;
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS shopify_inventory_item_id TEXT;

-- In-store hold system
CREATE TABLE IF NOT EXISTS pos_inventory_holds (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id        TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  item_id         TEXT NOT NULL REFERENCES pos_inventory_items(id) ON DELETE CASCADE,
  customer_id     TEXT REFERENCES pos_customers(id),
  staff_id        TEXT NOT NULL REFERENCES pos_staff(id),
  quantity        INT NOT NULL DEFAULT 1,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  held_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  fulfilled_at    TIMESTAMPTZ,
  released_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pos_inventory_holds_store_status ON pos_inventory_holds (store_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_holds_item_status ON pos_inventory_holds (item_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_holds_expires ON pos_inventory_holds (expires_at);
