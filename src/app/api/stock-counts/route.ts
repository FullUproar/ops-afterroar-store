import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

export async function GET() {
  try {
    const { db, storeId } = await requirePermission("inventory.adjust");

    const data = await db.posStockCount.findMany({
      where: { store_id: storeId },
      orderBy: { started_at: "desc" },
      include: {
        staff: { select: { name: true } },
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json(data);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId, staff } = await requirePermission("inventory.adjust");

    const body = await request.json();
    const { category_filter, location_filter, notes } = body;

    // Get matching inventory items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { store_id: storeId, active: true };
    if (category_filter && category_filter !== "all") {
      where.category = category_filter;
    }

    const inventoryItems = await db.posInventoryItem.findMany({
      where,
      orderBy: { name: "asc" },
    });

    if (inventoryItems.length === 0) {
      return NextResponse.json(
        { error: "No inventory items match the filter" },
        { status: 400 }
      );
    }

    const count = await db.posStockCount.create({
      data: {
        store_id: storeId,
        staff_id: staff.id,
        category_filter: category_filter || null,
        location_filter: location_filter || null,
        notes: notes || null,
        total_items: inventoryItems.length,
        items: {
          create: inventoryItems.map((item) => ({
            inventory_item_id: item.id,
            system_quantity: item.quantity,
          })),
        },
      },
      include: {
        items: {
          include: {
            inventory_item: {
              select: { id: true, name: true, category: true, sku: true, barcode: true },
            },
          },
        },
      },
    });

    return NextResponse.json(count, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
