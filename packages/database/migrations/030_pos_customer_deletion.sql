-- Customer data deletion tracking (GDPR/CCPA compliance)
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS deletion_requested BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_pos_customers_deleted ON pos_customers (store_id, deletion_requested) WHERE deletion_requested = TRUE;
