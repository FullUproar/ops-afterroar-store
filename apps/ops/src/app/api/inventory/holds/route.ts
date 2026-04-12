import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { pushInventoryToShopify } from "@/lib/shopify-sync";

/* ------------------------------------------------------------------ */
/*  /api/inventory/holds — Inventory hold management                   */
/*                                                                     */
/*  GET:    List active holds (optionally filter by ?item_id=)         */
/*  POST:   Create a hold (reduces online availability)                */
/*  DELETE:  Release a hold (restores online availability)              */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { storeId, db } = await requirePermission("inventory.adjust");

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("item_id");
    const status = searchParams.get("status") || "active";

    const holds = await db.posInventoryHold.findMany({
      where: {
        store_id: storeId,
        ...(itemId ? { item_id: itemId } : {}),
        status,
      },
      include: {
        item: { select: { id: true, name: true, quantity: true, online_allocation: true } },
        customer: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
      },
      orderBy: { held_at: "desc" },
    });

    return NextResponse.json({ holds });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { staff, storeId, db } = await requirePermission("inventory.adjust");

    let body: {
      item_id: string;
      customer_id?: string;
      quantity?: number;
      reason?: string;
      expires_hours?: number;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { item_id, customer_id, reason } = body;
    const quantity = body.quantity ?? 1;
    const expiresHours = body.expires_hours ?? 24;

    if (!item_id) {
      return NextResponse.json({ error: "item_id is required" }, { status: 400 });
    }

    if (quantity < 1) {
      return NextResponse.json({ error: "quantity must be >= 1" }, { status: 400 });
    }

    // Verify the item exists in this store
    const item = await db.posInventoryItem.findFirst({
      where: { id: item_id, store_id: storeId, active: true },
      select: { id: true, name: true, quantity: true, online_allocation: true, shopify_inventory_item_id: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Check there's enough physical stock to hold
    if (item.quantity < quantity) {
      return NextResponse.json(
        { error: `Insufficient stock. Available: ${item.quantity}, requested: ${quantity}` },
        { status: 400 },
      );
    }

    // Verify customer exists if provided
    if (customer_id) {
      const customer = await db.posCustomer.findFirst({
        where: { id: customer_id, store_id: storeId },
        select: { id: true },
      });
      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }
    }

    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);

    const hold = await db.posInventoryHold.create({
      data: {
        store_id: storeId,
        item_id,
        customer_id: customer_id || null,
        staff_id: staff.id,
        quantity,
        reason: reason || null,
        status: "active",
        expires_at: expiresAt,
      },
      include: {
        item: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
    });

    // Fire-and-forget: reduce online availability in Shopify
    if (item.shopify_inventory_item_id) {
      pushInventoryToShopify(storeId, item_id).catch((err) => {
        console.error("[Holds] Shopify sync failed after hold create:", err);
      });
    }

    return NextResponse.json({ hold }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { storeId, db } = await requirePermission("inventory.adjust");

    let body: { hold_id: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { hold_id } = body;

    if (!hold_id) {
      return NextResponse.json({ error: "hold_id is required" }, { status: 400 });
    }

    // Find the hold — must belong to this store and be active
    const hold = await db.posInventoryHold.findFirst({
      where: { id: hold_id, store_id: storeId, status: "active" },
      select: {
        id: true,
        item_id: true,
        item: { select: { shopify_inventory_item_id: true } },
      },
    });

    if (!hold) {
      return NextResponse.json(
        { error: "Hold not found or already released" },
        { status: 404 },
      );
    }

    // Release the hold
    await db.posInventoryHold.update({
      where: { id: hold_id },
      data: {
        status: "released",
        released_at: new Date(),
      },
    });

    // Fire-and-forget: restore online availability in Shopify
    if (hold.item.shopify_inventory_item_id) {
      pushInventoryToShopify(storeId, hold.item_id).catch((err) => {
        console.error("[Holds] Shopify sync failed after hold release:", err);
      });
    }

    return NextResponse.json({ released: true, hold_id });
  } catch (error) {
    return handleAuthError(error);
  }
}
