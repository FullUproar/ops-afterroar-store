-- Game Checkouts: track board game lending / rental from the store's game library
-- Part of Store Ops pos_ table family

CREATE TABLE IF NOT EXISTS pos_game_checkouts (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id           TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  inventory_item_id  TEXT NOT NULL REFERENCES pos_inventory_items(id),
  customer_id        TEXT REFERENCES pos_customers(id),
  staff_id           TEXT REFERENCES pos_staff(id),
  table_number       TEXT,
  checked_out_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_return_at TIMESTAMPTZ,
  returned_at        TIMESTAMPTZ,
  return_condition   TEXT,
  return_notes       TEXT,
  status             TEXT NOT NULL DEFAULT 'out',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_game_checkouts_store ON pos_game_checkouts(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_game_checkouts_store_status ON pos_game_checkouts(store_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_game_checkouts_item ON pos_game_checkouts(inventory_item_id);

-- Add lendable column to inventory items if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_inventory_items' AND column_name = 'lendable'
  ) THEN
    ALTER TABLE pos_inventory_items ADD COLUMN lendable BOOLEAN NOT NULL DEFAULT false;
  END IF;
END$$;
