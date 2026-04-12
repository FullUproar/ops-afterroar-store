import { NextRequest, NextResponse } from "next/server";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";
import { pushInventoryToShopify } from "@/lib/shopify-sync";

export async function GET(request: NextRequest) {
  try {
    const { db, storeId } = await requireStaff();

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = 50;
    const skip = (page - 1) * limit;

    const data = await db.posInventoryItem.findMany({
      where: { store_id: storeId },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    });

    return NextResponse.json(data);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requireStaff();

    const body = await request.json();
    const { name, category, price_cents, cost_cents, quantity, barcode, attributes } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const data = await db.posInventoryItem.create({
      data: {
        store_id: storeId,
        name: name.trim(),
        category: category || "other",
        price_cents: price_cents ?? 0,
        cost_cents: cost_cents ?? 0,
        quantity: quantity ?? 0,
        barcode: barcode || null,
        attributes: attributes || {},
      },
    });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { db, storeId } = await requireStaff();

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Item id is required" }, { status: 400 });
    }

    // Only allow updating known fields
    const allowedFields = [
      "name",
      "category",
      "price_cents",
      "cost_cents",
      "quantity",
      "barcode",
      "attributes",
      "lendable",
      "online_allocation",
      "active",
    ];

    const sanitized: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) {
        sanitized[key] = updates[key];
      }
    }

    // Verify item belongs to this store before updating
    const existing = await db.posInventoryItem.findFirst({
      where: { id, store_id: storeId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await db.posInventoryItem.update({
      where: { id },
      data: sanitized as any,
    });

    // Push to Shopify if allocation or quantity changed on a synced item
    if (('online_allocation' in sanitized || 'quantity' in sanitized) && data.shopify_inventory_item_id) {
      pushInventoryToShopify(storeId, id).catch((err) =>
        console.error("[Shopify sync] Failed after inventory update:", err)
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermission("inventory.adjust");

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Item id is required" }, { status: 400 });
    }

    // Verify item belongs to this store
    const existing = await db.posInventoryItem.findFirst({
      where: { id, store_id: storeId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await db.posInventoryItem.delete({ where: { id } });

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    return handleAuthError(error);
  }
}
