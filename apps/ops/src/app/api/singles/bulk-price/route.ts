import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/singles/bulk-price
 *
 * Bulk update prices for TCG singles.
 * Body: { updates: [{ item_id, new_price_cents }] }
 *
 * Updates all items in a transaction for atomicity.
 */
export async function POST(request: NextRequest) {
  try {
    const { storeId, db } = await requirePermission("inventory.adjust");

    const body = await request.json();
    const { updates } = body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "updates array is required" },
        { status: 400 }
      );
    }

    if (updates.length > 500) {
      return NextResponse.json(
        { error: "Maximum 500 items per batch" },
        { status: 400 }
      );
    }

    // Validate all entries
    for (const u of updates) {
      if (!u.item_id || typeof u.new_price_cents !== "number" || u.new_price_cents < 0) {
        return NextResponse.json(
          { error: `Invalid entry: ${JSON.stringify(u)}` },
          { status: 400 }
        );
      }
    }

    // Run all updates in a transaction
    const results = await prisma.$transaction(
      updates.map((u: { item_id: string; new_price_cents: number }) =>
        prisma.posInventoryItem.updateMany({
          where: {
            id: u.item_id,
            store_id: storeId,
            category: "tcg_single",
          },
          data: {
            price_cents: u.new_price_cents,
            updated_at: new Date(),
          },
        })
      )
    );

    const totalUpdated = results.reduce((s, r) => s + r.count, 0);

    return NextResponse.json({
      updated: totalUpdated,
      total_submitted: updates.length,
      message: `${totalUpdated} item${totalUpdated !== 1 ? "s" : ""} updated`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
