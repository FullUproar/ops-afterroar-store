-- 034: Staff invite tokens for email-based onboarding
-- Owner creates staff → generates invite token → staff clicks link → sets password + PIN

ALTER TABLE pos_staff ADD COLUMN IF NOT EXISTS invite_token TEXT;
ALTER TABLE pos_staff ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
ALTER TABLE pos_staff ADD COLUMN IF NOT EXISTS invite_accepted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pos_staff_invite_token ON pos_staff (invite_token);
