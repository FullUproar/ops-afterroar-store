import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/passport/suggestions                                      */
/*  Find unlinked customers who might match HQ users by email.          */
/*  Helps staff link existing customers to Afterroar accounts.          */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const { db, storeId } = await requirePermission("customers.view");

    // Get unlinked customers with email addresses
    const unlinked = await db.posCustomer.findMany({
      where: {
        store_id: storeId,
        afterroar_user_id: null,
        email: { not: null },
      },
      select: { id: true, name: true, email: true },
    });

    if (unlinked.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Check which emails match HQ users
    const emails = unlinked.map(c => c.email!).filter(Boolean);
    if (emails.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Batch lookup in HQ User table
    const placeholders = emails.map((_, i) => `$${i + 1}`).join(",");
    const hqMatches = await prisma.$queryRawUnsafe<Array<{ id: string; email: string; displayName: string | null }>>(
      `SELECT id, email, "displayName" FROM "User" WHERE email IN (${placeholders})`,
      ...emails,
    );

    const hqByEmail = new Map(hqMatches.map(u => [u.email.toLowerCase(), u]));

    const suggestions = unlinked
      .filter(c => c.email && hqByEmail.has(c.email.toLowerCase()))
      .map(c => {
        const hq = hqByEmail.get(c.email!.toLowerCase())!;
        return {
          customer_id: c.id,
          customer_name: c.name,
          customer_email: c.email,
          afterroar_user_id: hq.id,
          afterroar_display_name: hq.displayName,
        };
      });

    return NextResponse.json({ suggestions });
  } catch (error) {
    return handleAuthError(error);
  }
}
