import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  POST /api/inventory/flag-reorder — cashier flags an item for reorder*/
/*  Creates a lightweight notification for the manager/owner.           */
/*  Cashiers can see empty shelves but can't adjust inventory.          */
/*  This lets them DO something about it.                               */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { staff, storeId, db } = await requireStaff();

    let body: { inventory_item_id: string; note?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { inventory_item_id, note } = body;
    if (!inventory_item_id) {
      return NextResponse.json({ error: "inventory_item_id is required" }, { status: 400 });
    }

    // Verify item exists and belongs to this store (tenant-scoped)
    const item = await db.posInventoryItem.findFirst({
      where: { id: inventory_item_id },
      select: { id: true, name: true, quantity: true, low_stock_threshold: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Store the flag in the item's attributes (no new table needed)
    // SECURITY: scope via tenant client
    const existing = await db.posInventoryItem.findFirst({
      where: { id: inventory_item_id },
      select: { attributes: true },
    });

    const attrs = (existing?.attributes ?? {}) as Record<string, unknown>;
    attrs.reorder_flagged = true;
    attrs.reorder_flagged_at = new Date().toISOString();
    attrs.reorder_flagged_by = staff.name;
    attrs.reorder_note = note ?? `Low/out of stock (qty: ${item.quantity})`;

    await db.posInventoryItem.update({
      where: { id: inventory_item_id },
      data: { attributes: JSON.parse(JSON.stringify(attrs)) },
    });

    return NextResponse.json({
      success: true,
      item_name: item.name,
      quantity: item.quantity,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/inventory/flag-reorder — list items flagged for reorder     */
/*  Manager/owner view.                                                 */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { db } = await requireStaff();

    // Find items with reorder_flagged = true using Prisma JSON filter
    const flaggedItems = await db.posInventoryItem.findMany({
      where: {
        active: true,
        attributes: { path: ["reorder_flagged"], equals: true },
      },
      select: {
        id: true,
        name: true,
        category: true,
        quantity: true,
        low_stock_threshold: true,
        attributes: true,
        supplier: { select: { name: true } },
      },
      take: 100,
    });

    const flagged = flaggedItems
      .map((item) => {
        const attrs = item.attributes as Record<string, unknown>;
        return {
          id: item.id,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          low_stock_threshold: item.low_stock_threshold,
          supplier_name: item.supplier?.name ?? null,
          flagged_at: attrs.reorder_flagged_at as string,
          flagged_by: attrs.reorder_flagged_by as string,
          note: attrs.reorder_note as string,
        };
      })
      .sort((a, b) => a.quantity - b.quantity); // Most urgent first

    return NextResponse.json(flagged);
  } catch (error) {
    return handleAuthError(error);
  }
}
