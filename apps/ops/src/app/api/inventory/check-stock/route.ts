import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  POST /api/inventory/check-stock — pre-flight stock validation      */
/*  Called BEFORE payment to warn about insufficient stock.            */
/*  Returns issues array (empty = all good).                           */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const body = await request.json();
    const { items } = body as { items: Array<{ inventory_item_id: string; quantity: number }> };

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ issues: [] });
    }

    const issues: Array<{ name: string; available: number; requested: number }> = [];

    const itemIds = items.map((i) => i.inventory_item_id).filter(Boolean);
    const invItems = await db.posInventoryItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, name: true, quantity: true },
    });

    const invMap = new Map(invItems.map((i) => [i.id, i]));

    for (const item of items) {
      const inv = invMap.get(item.inventory_item_id);
      if (!inv) continue;
      if (inv.quantity < item.quantity) {
        issues.push({
          name: inv.name,
          available: inv.quantity,
          requested: item.quantity,
        });
      }
    }

    return NextResponse.json({ issues });
  } catch (error) {
    return handleAuthError(error);
  }
}
