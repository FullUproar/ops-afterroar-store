/**
 * HQ Bridge — Store Ops' contract for writing to Afterroar HQ tables.
 *
 * Rules:
 * - Store Ops READS freely from HQ tables
 * - Store Ops WRITES to HQ tables ONLY through these validated functions
 * - Each function enforces required fields + sensible defaults
 * - This prevents Store Ops from creating malformed HQ records
 *
 * Write contract:
 * | Table           | Store Ops Can Write            |
 * |-----------------|-------------------------------|
 * | User            | NEVER (read-only)             |
 * | GameNight       | CREATE via createHQGameNight() |
 * | GameNightGuest  | UPDATE attended/noShow only    |
 * | Venue           | NEVER (read-only)             |
 * | GameGroup       | NEVER (read-only)             |
 */

import { prisma } from "@/lib/prisma";

// ============================================================
// Types matching HQ enums
// ============================================================

export type GameNightVibe =
  | "CHILL"
  | "COMPETITIVE"
  | "CHAOS"
  | "PARTY"
  | "COZY";

export type GameNightStatus =
  | "PLANNING"
  | "LOCKED_IN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type GuestStatus = "PENDING" | "IN" | "MAYBE" | "OUT";

// ============================================================
// Create a GameNight from Store Ops
// ============================================================

interface CreateGameNightInput {
  title: string;
  date: Date;
  startTime?: string; // "19:00" format
  duration?: number; // minutes
  location?: string;
  description?: string;
  maxGuests?: number;
  vibe?: GameNightVibe;
  groupId: string; // the venue's GameGroup ID
  createdById: string; // the staff member's HQ User ID
  isPublic?: boolean;
  isBeginnerFriendly?: boolean;
}

export async function createHQGameNight(input: CreateGameNightInput) {
  const { default: cuid } = await import("cuid");

  return prisma.$queryRawUnsafe(
    `INSERT INTO "GameNight" (
      id, "hostId", title, description, date, "startTime", duration,
      location, "maxGuests", vibe, status, vibes, "groupId",
      "isPublic", "isBeginnerFriendly", "isTentative", "isPlayTest",
      "ndaRequired", "reminderSent", "dayOfReminderSent",
      "createdAt", "updatedAt"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10::"GameNightVibe", 'PLANNING'::"GameNightStatus", $11, $12,
      $13, $14, false, false,
      false, false, false,
      NOW(), NOW()
    ) RETURNING id, title, date, status`,
    cuid(), // id
    input.createdById, // hostId
    input.title,
    input.description || null,
    input.date,
    input.startTime || "19:00",
    input.duration || 240, // 4 hours default
    input.location || null,
    input.maxGuests || null,
    input.vibe || "COMPETITIVE",
    JSON.stringify([input.vibe || "COMPETITIVE"]), // vibes as JSON string
    input.groupId,
    input.isPublic ?? true,
    input.isBeginnerFriendly ?? false
  );
}

// ============================================================
// Mark a guest as attended (check-in from POS)
// ============================================================

export async function markGuestAttended(
  gameNightGuestId: string,
  attended: boolean
) {
  return prisma.$queryRawUnsafe(
    `UPDATE "GameNightGuest"
     SET attended = $1, "noShow" = $2, "updatedAt" = NOW()
     WHERE id = $3
     RETURNING id, attended, "noShow"`,
    attended,
    !attended, // if not attended and we're marking, it's a no-show
    gameNightGuestId
  );
}

// ============================================================
// Read helpers — Store Ops reads these freely
// ============================================================

export async function getVenueForStore(storeOwnerId: string) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; name: string; slug: string; claimedBy: string }>
  >(
    `SELECT id, name, slug, "claimedBy"
     FROM "Venue"
     WHERE "claimedBy" = $1
     LIMIT 1`,
    storeOwnerId
  );
  return rows[0] || null;
}

export async function getVenueGroup(venueOwnerId: string) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; name: string; slug: string }>
  >(
    `SELECT g.id, g.name, g.slug
     FROM "GameGroup" g
     WHERE g."createdById" = $1 AND g."groupType" = 'venue'
     LIMIT 1`,
    venueOwnerId
  );
  return rows[0] || null;
}

export async function getGameNightGuests(gameNightId: string) {
  return prisma.$queryRawUnsafe<
    Array<{
      id: string;
      userId: string | null;
      guestName: string | null;
      guestEmail: string | null;
      status: GuestStatus;
      attended: boolean;
      noShow: boolean;
      confirmedAt: Date | null;
      // Joined user data
      displayName: string | null;
      avatarUrl: string | null;
      reputationScore: number | null;
      identityVerified: boolean | null;
    }>
  >(
    `SELECT
      g.id, g."userId", g."guestName", g."guestEmail",
      g.status::"text" as status, g.attended, g."noShow", g."confirmedAt",
      u."displayName", u."avatarUrl", u."reputationScore", u."identityVerified"
     FROM "GameNightGuest" g
     LEFT JOIN "User" u ON g."userId" = u.id
     WHERE g."gameNightId" = $1
     ORDER BY g.status, g."guestName", u."displayName"`,
    gameNightId
  );
}

export async function getUpcomingGameNights(groupId: string) {
  return prisma.$queryRawUnsafe<
    Array<{
      id: string;
      title: string;
      date: Date;
      startTime: string;
      status: string;
      vibe: string;
      maxGuests: number | null;
      guestCount: number;
    }>
  >(
    `SELECT
      gn.id, gn.title, gn.date, gn."startTime",
      gn.status::"text" as status, gn.vibe::"text" as vibe,
      gn."maxGuests",
      (SELECT COUNT(*) FROM "GameNightGuest" g WHERE g."gameNightId" = gn.id AND g.status = 'IN') as "guestCount"
     FROM "GameNight" gn
     WHERE gn."groupId" = $1
       AND gn.date >= NOW()
       AND gn.status != 'CANCELLED'
     ORDER BY gn.date ASC
     LIMIT 20`,
    groupId
  );
}

// ============================================================
// Customer identity linking
// ============================================================

export async function findAfterroarUser(email: string) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      email: string;
      displayName: string | null;
      avatarUrl: string | null;
      reputationScore: number;
      identityVerified: boolean;
    }>
  >(
    `SELECT id, email, "displayName", "avatarUrl", "reputationScore", "identityVerified"
     FROM "User"
     WHERE email = $1
     LIMIT 1`,
    email
  );
  return rows[0] || null;
}

export async function linkCustomerToAfterroar(
  posCustomerId: string,
  afterroarUserId: string
) {
  return prisma.posCustomer.update({
    where: { id: posCustomerId },
    data: { afterroar_user_id: afterroarUserId },
  });
}

// ============================================================
// Earn points from purchase → HQ PointsLedger
// ============================================================

export async function earnPointsFromPurchase(params: {
  userId: string;
  points: number;
  storeId: string;
  transactionId: string;
  amountSpentCents: number;
}) {
  // Enqueue to outbox — HQ webhook will process asynchronously
  const { enqueueHQ } = await import("./hq-outbox");
  await enqueueHQ(params.storeId, "points_earned", {
    userId: params.userId,
    storeId: params.storeId,
    points: params.points,
    category: "purchase",
    transactionId: params.transactionId,
  });
}

// ============================================================
// Migrate POS loyalty points to HQ PointsLedger
// ============================================================

export async function migratePointsToHQ(params: {
  userId: string;
  points: number;
  storeId: string;
}) {
  const { enqueueHQ } = await import("./hq-outbox");
  await enqueueHQ(params.storeId, "points_earned", {
    userId: params.userId,
    storeId: params.storeId,
    points: params.points,
    category: "loyalty_migration",
  });
}

// ============================================================
// Venue search (read-only)
// ============================================================

export async function searchVenues(query: string) {
  return prisma.$queryRawUnsafe<
    Array<{
      id: string;
      name: string;
      slug: string;
      city: string | null;
      state: string | null;
    }>
  >(
    `SELECT id, name, slug, city, state
     FROM "Venue"
     WHERE LOWER(name) LIKE LOWER($1)
     ORDER BY name ASC
     LIMIT 10`,
    `%${query}%`
  );
}

export async function getVenueById(venueId: string) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      name: string;
      slug: string;
      city: string | null;
      state: string | null;
      claimedBy: string | null;
    }>
  >(
    `SELECT id, name, slug, city, state, "claimedBy"
     FROM "Venue"
     WHERE id = $1
     LIMIT 1`,
    venueId
  );
  return rows[0] || null;
}

export async function getGroupForVenue(venueId: string) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; name: string; slug: string }>
  >(
    `SELECT g.id, g.name, g.slug
     FROM "GameGroup" g
     JOIN "Venue" v ON v."claimedBy" = g."createdById"
     WHERE v.id = $1 AND g."groupType" = 'venue'
     LIMIT 1`,
    venueId
  );
  return rows[0] || null;
}

// ============================================================
// Trust badge helpers
// ============================================================

export function getTrustBadge(reputationScore: number | null): {
  level: "green" | "yellow" | "red";
  label: string;
} {
  if (reputationScore === null) return { level: "yellow", label: "Unknown" };
  if (reputationScore >= 80) return { level: "green", label: "Trusted" };
  if (reputationScore >= 40) return { level: "yellow", label: "Caution" };
  return { level: "red", label: "Flagged" };
}

export function isIdentityVerified(verified: boolean | null): boolean {
  return verified === true;
}
