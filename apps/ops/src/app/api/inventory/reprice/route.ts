import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { opLog } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  POST /api/inventory/reprice — one-click repricing from drift data  */
/*  Body: { items: [{ id, new_price_cents }] }                        */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { db, storeId, staff } = await requirePermission("inventory.pricing");

    const body = await request.json();
    const { items } = body as { items: Array<{ id: string; new_price_cents: number }> };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items array required" }, { status: 400 });
    }

    let updated = 0;
    for (const item of items) {
      if (!item.id || !item.new_price_cents || item.new_price_cents < 0) continue;

      await db.posInventoryItem.update({
        where: { id: item.id },
        data: { price_cents: item.new_price_cents, updated_at: new Date() },
      });
      updated++;
    }

    opLog({
      storeId,
      eventType: "inventory.price_change",
      message: `Bulk repriced ${updated} items from price drift`,
      metadata: { count: updated, staff_name: staff.name },
      staffName: staff.name,
    });

    return NextResponse.json({ updated });
  } catch (error) {
    return handleAuthError(error);
  }
}
