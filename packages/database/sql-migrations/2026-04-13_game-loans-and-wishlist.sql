-- Game Loan tracker — who has your games and when are they coming back
CREATE TABLE IF NOT EXISTS "GameLoan" (
  "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"          TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "gameTitle"       TEXT NOT NULL,
  "bggId"           INTEGER,
  "borrowerName"    TEXT NOT NULL,
  "borrowerContact" TEXT,
  "lentAt"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "dueDate"         TIMESTAMP WITH TIME ZONE,
  "returnedAt"      TIMESTAMP WITH TIME ZONE,
  "condition"       TEXT,
  "notes"           TEXT
);

CREATE INDEX IF NOT EXISTS "GameLoan_userId_idx" ON "GameLoan"("userId");
CREATE INDEX IF NOT EXISTS "GameLoan_userId_returnedAt_idx" ON "GameLoan"("userId", "returnedAt");

-- Wishlist — portable across stores, shareable for gift-giving
CREATE TABLE IF NOT EXISTS "WishlistItem" (
  "id"        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"    TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "gameTitle" TEXT NOT NULL,
  "bggId"     INTEGER,
  "priority"  INTEGER NOT NULL DEFAULT 3,
  "notes"     TEXT,
  "addedAt"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "WishlistItem_userId_gameTitle_key" UNIQUE ("userId", "gameTitle")
);

CREATE INDEX IF NOT EXISTS "WishlistItem_userId_idx" ON "WishlistItem"("userId");
