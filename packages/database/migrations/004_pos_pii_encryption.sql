-- ============================================================
-- Store Ops: PII Encryption columns
-- Adds encrypted versions of email and phone on pos_customers.
-- Safe to run against FU production database.
-- Does NOT modify existing columns (backward compatible).
-- ============================================================

-- Add encrypted columns (nullable, existing data stays in plaintext columns)
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS email_encrypted TEXT;
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS email_hash TEXT;

-- Index on email_hash for exact-match lookups on encrypted data
CREATE INDEX IF NOT EXISTS idx_pos_customers_email_hash ON pos_customers(store_id, email_hash);
