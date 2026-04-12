-- ============================================================
-- Store Ops: Promotions / Sale Pricing
-- Safe to run against FU production database.
-- ============================================================

CREATE TABLE IF NOT EXISTS pos_promotions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  value INTEGER NOT NULL,
  scope TEXT NOT NULL,
  scope_value TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_promotions_store ON pos_promotions(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_promotions_active ON pos_promotions(store_id, active);
