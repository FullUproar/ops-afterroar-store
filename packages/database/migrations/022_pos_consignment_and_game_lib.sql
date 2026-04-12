-- Consignment items
CREATE TABLE IF NOT EXISTS pos_consignment_items (
  id                  TEXT PRIMARY KEY,
  store_id            TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  consignor_id        TEXT NOT NULL REFERENCES pos_customers(id),
  inventory_item_id   TEXT REFERENCES pos_inventory_items(id),
  asking_price_cents  INT NOT NULL,
  commission_percent  DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  status              TEXT NOT NULL DEFAULT 'active',
  listed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sold_at             TIMESTAMPTZ,
  payout_cents        INT,
  payout_ledger_entry_id TEXT,
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_consignment_store ON pos_consignment_items(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_consignment_consignor ON pos_consignment_items(consignor_id);
CREATE INDEX IF NOT EXISTS idx_pos_consignment_status ON pos_consignment_items(store_id, status);

-- Game library enhancements
ALTER TABLE pos_game_checkouts ADD COLUMN IF NOT EXISTS due_back_at TIMESTAMPTZ;
ALTER TABLE pos_game_checkouts ADD COLUMN IF NOT EXISTS fee_cents INT DEFAULT 0;
