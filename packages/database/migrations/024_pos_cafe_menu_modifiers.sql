-- Cafe menu builder + modifier system
CREATE TABLE IF NOT EXISTS pos_menu_items (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'other', -- drink | food | snack | alcohol | other
  price_cents     INT NOT NULL DEFAULT 0,
  description     TEXT,
  available       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INT NOT NULL DEFAULT 0,
  age_restricted  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_menu_modifiers (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  name            TEXT NOT NULL, -- "Milk Type", "Size", "Add-ons"
  options         JSONB NOT NULL DEFAULT '[]', -- [{name: "Oat Milk", price_cents: 75}, ...]
  required        BOOLEAN NOT NULL DEFAULT FALSE,
  multi_select    BOOLEAN NOT NULL DEFAULT FALSE,
  applies_to      TEXT[] DEFAULT '{}', -- category filters: ["drink", "food"]
  sort_order      INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pos_menu_items_store ON pos_menu_items(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_menu_modifiers_store ON pos_menu_modifiers(store_id);

-- Tab split support
ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS parent_tab_id TEXT REFERENCES pos_tabs(id);
ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS transferred_from TEXT;
