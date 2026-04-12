-- Cafe / concession module
CREATE TABLE IF NOT EXISTS pos_tabs (
  id               TEXT PRIMARY KEY,
  store_id         TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  customer_id      TEXT REFERENCES pos_customers(id),
  staff_id         TEXT REFERENCES pos_staff(id),
  event_id         TEXT REFERENCES pos_events(id),
  table_label      TEXT,
  status           TEXT NOT NULL DEFAULT 'open',
  subtotal_cents   INT NOT NULL DEFAULT 0,
  tax_cents        INT NOT NULL DEFAULT 0,
  total_cents      INT NOT NULL DEFAULT 0,
  ledger_entry_id  TEXT,
  notes            TEXT,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pos_tab_items (
  id          TEXT PRIMARY KEY,
  tab_id      TEXT NOT NULL REFERENCES pos_tabs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price_cents INT NOT NULL,
  quantity    INT NOT NULL DEFAULT 1,
  modifiers   TEXT,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  served_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pos_tabs_store ON pos_tabs(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_tabs_status ON pos_tabs(store_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_tab_items_tab ON pos_tab_items(tab_id);
CREATE INDEX IF NOT EXISTS idx_pos_tab_items_status ON pos_tab_items(status);
