-- ============================================================
-- Store Ops: Import Jobs & Records tables
-- Safe to run against FU production database.
-- Creates ONLY new pos_ prefixed tables.
-- ============================================================

-- POS Import Jobs
CREATE TABLE IF NOT EXISTS pos_import_jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES pos_staff(id),
  source_system TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  row_count INTEGER DEFAULT 0,
  field_mapping JSONB DEFAULT '{}',
  validation_errors JSONB DEFAULT '[]',
  preview_data JSONB DEFAULT '[]',
  dry_run_summary JSONB,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_import_jobs_store ON pos_import_jobs(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_import_jobs_hash ON pos_import_jobs(store_id, file_hash);

-- POS Import Records
CREATE TABLE IF NOT EXISTS pos_import_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  import_job_id TEXT NOT NULL REFERENCES pos_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  source_data JSONB NOT NULL,
  mapped_data JSONB NOT NULL,
  target_table TEXT NOT NULL,
  target_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_import_records_job ON pos_import_records(import_job_id);

-- POS Data Certifications
CREATE TABLE IF NOT EXISTS pos_certifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES pos_staff(id),
  status TEXT NOT NULL DEFAULT 'running',
  checks JSONB NOT NULL DEFAULT '[]',
  summary JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_certifications_store ON pos_certifications(store_id);
