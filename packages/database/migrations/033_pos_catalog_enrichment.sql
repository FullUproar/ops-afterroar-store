-- 033: Enrich pos_catalog_products with universal product metadata
-- Board games: players, play time, age, BGG data, publisher, mechanics
-- Sealed: contents, cards per pack, packs per box
-- All products: distributor, MSRP, release year

-- Universal
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS publisher TEXT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS distributor TEXT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS release_year INT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS msrp_cents INT;

-- Board game metadata (from BGG)
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS bgg_id TEXT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS bgg_rating DECIMAL(3,1);
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS bgg_weight DECIMAL(3,2);
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS min_players INT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS max_players INT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS min_play_time INT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS max_play_time INT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS min_age INT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS mechanics TEXT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS themes TEXT;

-- Sealed product
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS contents_description TEXT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS cards_per_pack INT;
ALTER TABLE pos_catalog_products ADD COLUMN IF NOT EXISTS packs_per_box INT;

-- Index for BGG lookups
CREATE INDEX IF NOT EXISTS idx_pos_catalog_products_bgg ON pos_catalog_products (bgg_id);
