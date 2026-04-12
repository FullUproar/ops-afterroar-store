-- CardTrader + Mana Pool marketplace fields on inventory items
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS cardtrader_product_id TEXT;
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS listed_on_cardtrader BOOLEAN DEFAULT FALSE;
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS manapool_listing_id TEXT;
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS listed_on_manapool BOOLEAN DEFAULT FALSE;
