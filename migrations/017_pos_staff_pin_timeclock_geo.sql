-- Staff PIN for fast auth (mobile timeclock, two-layer auth, manager overrides)
ALTER TABLE pos_staff ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE pos_staff ADD COLUMN IF NOT EXISTS badge_code TEXT;

-- Time entry geofence data
ALTER TABLE pos_time_entries ADD COLUMN IF NOT EXISTS clock_in_lat DOUBLE PRECISION;
ALTER TABLE pos_time_entries ADD COLUMN IF NOT EXISTS clock_in_lng DOUBLE PRECISION;
ALTER TABLE pos_time_entries ADD COLUMN IF NOT EXISTS clock_in_location TEXT; -- 'on_site' | 'remote' | 'no_gps'

CREATE INDEX IF NOT EXISTS idx_pos_staff_badge ON pos_staff(badge_code) WHERE badge_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_staff_store_pin ON pos_staff(store_id) WHERE pin_hash IS NOT NULL;
