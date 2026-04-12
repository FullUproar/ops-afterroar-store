-- ============================================================
-- Store Ops: Time Clock
-- ============================================================

CREATE TABLE IF NOT EXISTS pos_time_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL,
  staff_id TEXT NOT NULL REFERENCES pos_staff(id),
  clock_in TIMESTAMPTZ NOT NULL,
  clock_out TIMESTAMPTZ,
  hours_worked NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_time_entries_store ON pos_time_entries(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_time_entries_staff ON pos_time_entries(staff_id);
CREATE INDEX IF NOT EXISTS idx_pos_time_entries_store_date ON pos_time_entries(store_id, clock_in DESC);
