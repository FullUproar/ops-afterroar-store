-- Mobile register access codes and session tracking
CREATE TABLE IF NOT EXISTS pos_mobile_sessions (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  staff_id        TEXT REFERENCES pos_staff(id),
  device_name     TEXT,
  paired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_count        INT NOT NULL DEFAULT 0,
  tx_total_cents  INT NOT NULL DEFAULT 0,
  revoked         BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address      TEXT,
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_mobile_sessions_store
  ON pos_mobile_sessions(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_mobile_sessions_active
  ON pos_mobile_sessions(store_id, revoked, expires_at);

-- Rate limiting for access code attempts
CREATE TABLE IF NOT EXISTS pos_access_code_attempts (
  id         TEXT PRIMARY KEY,
  store_id   TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  ip_address TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_pos_access_attempts_store_time
  ON pos_access_code_attempts(store_id, attempted_at DESC);
