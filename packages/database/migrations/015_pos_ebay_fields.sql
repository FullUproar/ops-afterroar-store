-- Add eBay marketplace integration fields to inventory items
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS ebay_listing_id TEXT;
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS ebay_offer_id TEXT;
ALTER TABLE pos_inventory_items ADD COLUMN IF NOT EXISTS listed_on_ebay BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_pos_inv_ebay ON pos_inventory_items(ebay_listing_id) WHERE ebay_listing_id IS NOT NULL;
