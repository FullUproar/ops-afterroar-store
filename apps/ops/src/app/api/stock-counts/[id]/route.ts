import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requirePermission("inventory.adjust");
    const { id } = await params;

    const count = await db.posStockCount.findFirst({
      where: { id },
      include: {
        staff: { select: { name: true } },
        items: {
          include: {
            inventory_item: {
              select: {
                id: true,
                name: true,
                category: true,
                sku: true,
                barcode: true,
              },
            },
          },
          orderBy: { inventory_item: { name: "asc" } },
        },
      },
    });

    if (!count) {
      return NextResponse.json(
        { error: "Stock count not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(count);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requirePermission("inventory.adjust");
    const { id } = await params;
    const body = await request.json();
    const { item_id, counted_quantity, notes } = body;

    if (!item_id) {
      return NextResponse.json(
        { error: "item_id is required" },
        { status: 400 }
      );
    }

    const count = await db.posStockCount.findFirst({ where: { id } });
    if (!count) {
      return NextResponse.json(
        { error: "Stock count not found" },
        { status: 404 }
      );
    }
    if (count.status === "completed") {
      return NextResponse.json(
        { error: "Cannot modify a completed count" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = { counted_at: new Date() };
    if (typeof counted_quantity === "number") {
      updateData.counted_quantity = counted_quantity;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    await db.posStockCountItem.update({
      where: { id: item_id },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db, storeId, staff } = await requirePermission("inventory.adjust");
    const { id } = await params;
    const body = await request.json();

    if (body.action === "complete") {
      const count = await db.posStockCount.findFirst({
        where: { id },
        include: { items: true },
      });

      if (!count) {
        return NextResponse.json(
          { error: "Stock count not found" },
          { status: 404 }
        );
      }

      if (count.status === "completed") {
        return NextResponse.json(
          { error: "Count already completed" },
          { status: 400 }
        );
      }

      let varianceCount = 0;

      // Apply variances to inventory
      for (const item of count.items) {
        if (item.counted_quantity === null) continue;

        const variance = item.counted_quantity - item.system_quantity;
        if (variance !== 0) {
          varianceCount++;

          // Update inventory quantity
          await db.posInventoryItem.update({
            where: { id: item.inventory_item_id },
            data: {
              quantity: item.counted_quantity,
              updated_at: new Date(),
            },
          });

          // Create ledger entry for the adjustment
          await db.posLedgerEntry.create({
            data: {
              store_id: storeId,
              type: "adjustment",
              staff_id: staff.id,
              amount_cents: 0,
              description: `Stock count adjustment: ${variance > 0 ? "+" : ""}${variance} units`,
              metadata: {
                stock_count_id: id,
                inventory_item_id: item.inventory_item_id,
                system_quantity: item.system_quantity,
                counted_quantity: item.counted_quantity,
                variance,
              },
            },
          });
        }
      }

      // Complete the count
      const updated = await db.posStockCount.update({
        where: { id },
        data: {
          status: "completed",
          completed_at: new Date(),
          variances: varianceCount,
        },
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return handleAuthError(error);
  }
}
