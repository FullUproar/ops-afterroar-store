-- Cafe enhancements: unified tabs (F&B + retail), table fees, age verification
ALTER TABLE pos_tab_items ADD COLUMN IF NOT EXISTS inventory_item_id TEXT REFERENCES pos_inventory_items(id);
ALTER TABLE pos_tab_items ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'cafe'; -- cafe | retail | table_fee

ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS table_fee_type TEXT; -- flat | hourly | free_with_purchase
ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS table_fee_cents INT DEFAULT 0;
ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS table_fee_waived BOOLEAN DEFAULT FALSE;
ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS age_verified BOOLEAN DEFAULT FALSE;
