-- Operational logging table for remote support and audit trail
-- Table may already exist — using IF NOT EXISTS for safety.

CREATE TABLE IF NOT EXISTS pos_operational_logs (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info',
  message     TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  user_id     TEXT,
  staff_name  TEXT,
  device_info TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_op_logs_store_created
  ON pos_operational_logs(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_op_logs_store_event
  ON pos_operational_logs(store_id, event_type);

CREATE INDEX IF NOT EXISTS idx_pos_op_logs_store_severity
  ON pos_operational_logs(store_id, severity);
