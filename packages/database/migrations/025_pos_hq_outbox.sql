-- HQ Bridge Outbox — async, eventually consistent writes to HQ
-- All HQ writes go through this table. A drain job POSTs to HQ webhook.
-- Never fails a POS transaction because HQ is unreachable.

CREATE TABLE IF NOT EXISTS pos_hq_outbox (
  id              SERIAL PRIMARY KEY,
  idempotency_key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  store_id        TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  event_type      VARCHAR(50) NOT NULL,  -- checkin, points_earned, tournament_result, event_attendance
  payload         JSONB NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, processing, sent, failed, dead_letter
  retry_count     INT NOT NULL DEFAULT 0,
  max_retries     INT NOT NULL DEFAULT 5,
  next_retry_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_hq_outbox_drain
  ON pos_hq_outbox (status, next_retry_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_pos_hq_outbox_store
  ON pos_hq_outbox (store_id, created_at DESC);
