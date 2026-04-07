import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  GET /api/passport/barcode?code={shortCode}                         */
/*  Look up an HQ User by their 8-char short code.                     */
/*  Falls back to matching last 8 chars of user ID if shortCode field  */
/*  doesn't exist yet.                                                 */
/*                                                                     */
/*  Auth: requireStaff()                                               */
/*  Returns same shape as /api/passport/scan                           */
/* ------------------------------------------------------------------ */

interface HQUserRow {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  reputationScore: number | null;
  identityVerified: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const code = request.nextUrl.searchParams.get("code");
    if (!code?.trim()) {
      return NextResponse.json({ error: "code required" }, { status: 400 });
    }

    const shortCode = code.trim();
    if (!/^[a-zA-Z0-9]{8}$/.test(shortCode)) {
      return NextResponse.json(
        { error: "Invalid short code format (expected 8 alphanumeric chars)" },
        { status: 400 },
      );
    }

    let hqUser: HQUserRow | null = null;

    // Try shortCode field first (may not exist yet on HQ schema)
    try {
      const rows = await prisma.$queryRawUnsafe<HQUserRow[]>(
        `SELECT id, "displayName", "avatarUrl", "reputationScore", "identityVerified"
         FROM "User"
         WHERE "shortCode" = $1
         LIMIT 1`,
        shortCode,
      );
      if (rows.length > 0) hqUser = rows[0];
    } catch {
      // Column may not exist — fall through to fallback
    }

    // Fallback: match last 8 chars of user ID
    if (!hqUser) {
      const rows = await prisma.$queryRawUnsafe<HQUserRow[]>(
        `SELECT id, "displayName", "avatarUrl", "reputationScore", "identityVerified"
         FROM "User"
         WHERE RIGHT(id, 8) = $1
         LIMIT 1`,
        shortCode.toLowerCase(),
      );
      hqUser = rows[0] || null;
    }

    if (!hqUser) {
      return NextResponse.json({ found: false });
    }

    // Check if already linked in this store
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
