/**
 * POST /api/devices/pairing-codes — Owner generates a 6-digit code for a new tablet.
 *
 * Owner is signed in to Store Ops via Passport. The code is bound to:
 *   - Their User.id (so the resulting RegisterDevice row carries Passport identity)
 *   - The store they have an active staff record on
 *   - A 10-minute expiry
 *   - Optional display_name pre-set (else cashier names it on pair)
 *
 * Auth: session-based, requires `staff.manage` permission.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

const CODE_TTL_MS = 10 * 60 * 1000;

function generateCode(): string {
  // Avoid leading zero for cosmetics — easier to type. Range 100000–999999.
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: NextRequest) {
  try {
    const { staff, storeId } = await requirePermission("staff.manage");

    let body: { display_name?: string } = {};
    try {
      body = await request.json();
    } catch {
      // empty body OK
    }

    // Generate-with-retry to handle (extremely unlikely) collisions on live codes.
    let attempts = 0;
    while (attempts < 10) {
      const code = generateCode();
      const expires = new Date(Date.now() + CODE_TTL_MS);
      try {
        const row = await prisma.registerPairingCode.create({
          data: {
            code,
            store_id: storeId,
            paired_by: staff.user_id,
            display_name: body.display_name?.trim() || null,
            expires_at: expires,
          },
        });
        return NextResponse.json({
          code: row.code,
          expires_at: row.expires_at,
        });
      } catch (err) {
        // P2002 = unique constraint violation on `code` PK; retry.
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code?: string }).code === "P2002"
        ) {
          attempts++;
          continue;
        }
        throw err;
      }
    }
    return NextResponse.json(
      { error: "Could not allocate a unique pairing code. Try again." },
      { status: 503 },
    );
  } catch (error) {
    return handleAuthError(error);
  }
}
