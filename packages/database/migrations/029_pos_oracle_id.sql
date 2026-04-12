-- Add oracle_id and Scryfall card data to catalog products for MTG card matching
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS oracle_id TEXT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS scryfall_id TEXT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS mana_cost TEXT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS type_line TEXT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS oracle_text TEXT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS keywords TEXT; -- comma-separated
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS color_identity TEXT; -- comma-separated: W,U,B,R,G
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS cmc DECIMAL(4,1);
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS rarity TEXT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS legalities JSONB;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS prices JSONB;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS image_uri TEXT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Also add oracle_id to inventory items for matching
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS oracle_id TEXT;

CREATE INDEX IF NOT EXISTS idx_pos_catalog_oracle ON pos_catalog_products(oracle_id);
CREATE INDEX IF NOT EXISTS idx_pos_catalog_scryfall ON pos_catalog_products(scryfall_id);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_oracle ON pos_inventory_items(oracle_id);
