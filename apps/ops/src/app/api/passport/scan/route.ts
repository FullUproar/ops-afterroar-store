import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  POST /api/passport/scan                                            */
/*  Staff scans a Passport QR code or short code at the register.      */
/*  Returns the HQ profile + whether consent is needed to link.        */
/*                                                                     */
/*  Auth: requireStaff()                                               */
/*  Body: { code: string } — QR content (URL like /p/{userId} or       */
/*         short code or raw user ID)                                   */
/* ------------------------------------------------------------------ */

interface HQUserRow {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  reputationScore: number | null;
  identityVerified: boolean;
}

/** Parse the user ID from various QR/code formats */
function parsePassportCode(code: string): {
  userId: string | null;
  shortCode: string | null;
} {
  // URL format: https://fulluproar.com/p/{userId} or /p/{userId}
  const urlMatch = code.match(/\/p\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) {
    return { userId: urlMatch[1], shortCode: null };
  }

  // Short code: exactly 8 alphanumeric chars
  if (/^[a-zA-Z0-9]{8}$/.test(code)) {
    return { userId: null, shortCode: code };
  }

  // Raw user ID (CUID or other ID format)
  if (code.length >= 20 && /^[a-z0-9]+$/.test(code)) {
    return { userId: code, shortCode: null };
  }

  // URL with https:// and /p/ path
  if (code.startsWith("http")) {
    try {
      const url = new URL(code);
      const pathMatch = url.pathname.match(/\/p\/([a-zA-Z0-9_-]+)/);
      if (pathMatch) {
        return { userId: pathMatch[1], shortCode: null };
      }
    } catch {
      // Not a valid URL — fall through
    }
  }

  return { userId: null, shortCode: null };
}

/** Look up HQ user by passport code — try passportCode field first, fall back to last 8 chars of ID */
async function lookupByShortCode(
  shortCode: string,
): Promise<HQUserRow | null> {
  // Try passportCode field
  try {
    const rows = await prisma.$queryRawUnsafe<HQUserRow[]>(
      `SELECT id, "displayName", "avatarUrl", "reputationScore", "identityVerified"
       FROM "User"
       WHERE "passportCode" = $1
       LIMIT 1`,
      shortCode,
    );
    if (rows.length > 0) return rows[0];
  } catch {
    // Column may not exist — fall through
  }

  // Fallback: match last 8 chars of user ID
  const rows = await prisma.$queryRawUnsafe<HQUserRow[]>(
    `SELECT id, "displayName", "avatarUrl", "reputationScore", "identityVerified"
     FROM "User"
     WHERE RIGHT(id, 8) = $1
     LIMIT 1`,
    shortCode.toLowerCase(),
  );
  return rows[0] || null;
}

/** Look up HQ user by ID */
async function lookupByUserId(userId: string): Promise<HQUserRow | null> {
  const rows = await prisma.$queryRawUnsafe<HQUserRow[]>(
    `SELECT id, "displayName", "avatarUrl", "reputationScore", "identityVerified"
     FROM "User"
     WHERE id = $1
     LIMIT 1`,
    userId,
  );
  return rows[0] || null;
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requireStaff();

    let body: { code: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { code } = body;
    if (!code?.trim()) {
      return NextResponse.json({ error: "code required" }, { status: 400 });
    }

    const parsed = parsePassportCode(code.trim());

    // Try HQ API first, fall back to direct DB lookup
    let hqUser: HQUserRow | null = null;

    if (parsed.userId) {
      // Try HQ lookup API
      try {
        const hqRes = await fetch(
          `https://www.fulluproar.com/api/passport/lookup?id=${encodeURIComponent(parsed.userId)}`,
          { signal: AbortSignal.timeout(3000) },
        );
        if (hqRes.ok) {
          const data = await hqRes.json();
          if (data.id) {
            hqUser = {
              id: data.id,
              displayName: data.displayName || null,
              avatarUrl: data.avatarUrl || null,
              reputationScore: data.reputationScore ?? null,
              identityVerified: data.identityVerified ?? false,
            };
          }
        }
      } catch {
        // HQ API unavailable — fall back to direct DB
      }

      // Direct DB fallback
      if (!hqUser) {
        hqUser = await lookupByUserId(parsed.userId);
      }
    } else if (parsed.shortCode) {
      hqUser = await lookupByShortCode(parsed.shortCode);
    } else {
      return NextResponse.json(
        { error: "Unrecognized code format" },
        { status: 400 },
      );
    }

    if (!hqUser) {
      return NextResponse.json({ found: false });
    }

    // Check if this user is already linked to a customer in this store
    const existingCustomer = await db.posCustomer.findFirst({
      where: { afterroar_user_id: hqUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        credit_balance_cents: true,
        loyalty_points: true,
        afterroar_user_id: true,
        created_at: true,
      },
    });

    if (existingCustomer) {
      // Already linked — return the customer
      return NextResponse.json({
        found: true,
        alreadyLinked: true,
        customer: existingCustomer,
        profile: {
          displayName: hqUser.displayName,
          avatarUrl: hqUser.avatarUrl,
          reputationScore: hqUser.reputationScore,
          identityVerified: hqUser.identityVerified,
        },
      });
    }

    // Not linked — return profile for consent flow
    // Never expose email to the store
    return NextResponse.json({
      found: true,
      alreadyLinked: false,
      firstScanAtStore: true,
      requiresConsent: true,
      afterroar_user_id: hqUser.id,
      profile: {
        displayName: hqUser.displayName,
        avatarUrl: hqUser.avatarUrl,
        reputationScore: hqUser.reputationScore,
        identityVerified: hqUser.identityVerified,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
