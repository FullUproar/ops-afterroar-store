-- Passport Badges — portable identity markers users earn, buy, or receive.
-- Badges belong to users, issued by entities (Afterroar native, Full Uproar, stores, etc.).

CREATE TABLE IF NOT EXISTS "PassportBadge" (
  "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "slug"        TEXT NOT NULL UNIQUE,
  "name"        TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "iconEmoji"   TEXT,
  "iconUrl"     TEXT,
  "color"       TEXT NOT NULL DEFAULT '#FF8200',
  "category"    TEXT NOT NULL DEFAULT 'general',
  "issuerType"  TEXT NOT NULL DEFAULT 'afterroar',
  "issuerName"  TEXT,
  "issuerId"    TEXT,
  "isLimited"   BOOLEAN NOT NULL DEFAULT false,
  "totalIssued" INTEGER NOT NULL DEFAULT 0,
  "maxSupply"   INTEGER,
  "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "retiredAt"   TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS "PassportBadge_category_idx" ON "PassportBadge"("category");
CREATE INDEX IF NOT EXISTS "PassportBadge_issuerType_idx" ON "PassportBadge"("issuerType");

CREATE TABLE IF NOT EXISTS "UserBadge" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"     TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "badgeId"    TEXT NOT NULL REFERENCES "PassportBadge"(id) ON DELETE CASCADE,
  "issuedAt"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "issuedBy"   TEXT,
  "reason"     TEXT,
  "metadata"   JSONB DEFAULT '{}',
  "revokedAt"  TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "UserBadge_user_badge_unique" UNIQUE ("userId", "badgeId")
);

CREATE INDEX IF NOT EXISTS "UserBadge_userId_idx" ON "UserBadge"("userId");
CREATE INDEX IF NOT EXISTS "UserBadge_badgeId_idx" ON "UserBadge"("badgeId");

-- Seed launch badges
INSERT INTO "PassportBadge" ("id", "slug", "name", "description", "iconEmoji", "color", "category", "issuerType", "issuerName", "isLimited")
VALUES
  (
    gen_random_uuid()::text,
    'passport-pioneer',
    'Passport Pioneer',
    'One of the first to create an Afterroar Passport. You were here at the beginning.',
    '🧭',
    '#FF8200',
    'founding',
    'afterroar',
    'Afterroar',
    true
  ),
  (
    gen_random_uuid()::text,
    'fugly-early-adopter',
    'Fugly''s Early Adopter',
    'Pre-ordered Mayhem Machine before it shipped. A real believer.',
    '🎲',
    '#FF8200',
    'purchase',
    'fulluproar',
    'Full Uproar Games',
    true
  )
ON CONFLICT ("slug") DO NOTHING;
