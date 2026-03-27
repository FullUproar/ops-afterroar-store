import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/**
 * POST /api/inventory/catalog-link
 * Manage catalog link for an inventory item.
 * Body: { inventory_item_id, action: "unshare" }
 */
export async function POST(request: NextRequest) {
  try {
    const { db } = await requirePermission("inventory.adjust");

    const body = await request.json();
    const { inventory_item_id, action } = body;

    if (!inventory_item_id) {
      return NextResponse.json(
        { error: "inventory_item_id is required" },
        { status: 400 }
      );
    }

    const item = await db.posInventoryItem.findFirst({
      where: { id: inventory_item_id },
    });
    if (!item) {
      return NextResponse.json(
        { error: "Inventory item not found" },
        { status: 404 }
      );
    }

    if (action === "unshare") {
      await db.posInventoryItem.update({
        where: { id: item.id },
        data: {
          shared_to_catalog: false,
          catalog_product_id: null,
          updated_at: new Date(),
        },
      });

      return NextResponse.json({
        action: "unshared",
        message: `${item.name} removed from catalog`,
      });
    }

    return NextResponse.json(
      { error: "Unknown action. Supported: unshare" },
      { status: 400 }
    );
  } catch (error) {
    return handleAuthError(error);
  }
}
