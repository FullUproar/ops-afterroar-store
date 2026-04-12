-- 032: Add hold_type to pos_tabs for unified POS/cafe tab system
-- Tabs can now represent cafe orders OR parked register carts
-- hold_type: 'cafe' (default) | 'retail_park' (parked cart from register)

ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS hold_type TEXT DEFAULT 'cafe';
ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS parked_by_staff_id TEXT;
ALTER TABLE pos_tabs ADD COLUMN IF NOT EXISTS parked_at TIMESTAMPTZ;

-- Index for finding parked carts quickly
CREATE INDEX IF NOT EXISTS idx_pos_tabs_hold_type ON pos_tabs (store_id, hold_type, status);
