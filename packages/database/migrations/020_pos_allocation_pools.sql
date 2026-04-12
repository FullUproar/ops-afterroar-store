-- Allocation pools for prerelease/product allocation management
CREATE TABLE IF NOT EXISTS pos_allocation_pools (
  id               TEXT PRIMARY KEY,
  store_id         TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  product_name     TEXT NOT NULL,
  sku              TEXT,
  total_allocated  INT NOT NULL DEFAULT 0,
  total_reserved   INT NOT NULL DEFAULT 0,
  release_date     DATE,
  event_id         TEXT REFERENCES pos_events(id),
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'open',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_alloc_pools_store
  ON pos_allocation_pools(store_id);

-- Link preorders to allocation pools
ALTER TABLE pos_preorders ADD COLUMN IF NOT EXISTS pool_id TEXT REFERENCES pos_allocation_pools(id);
ALTER TABLE pos_preorders ADD COLUMN IF NOT EXISTS waitlisted BOOLEAN DEFAULT FALSE;
ALTER TABLE pos_preorders ADD COLUMN IF NOT EXISTS deposit_ledger_entry_id TEXT;
