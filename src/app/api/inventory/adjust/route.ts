import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { opLog } from "@/lib/op-log";

const VALID_REASONS = [
  "Received shipment",
  "Damaged/defective",
  "Physical count correction",
  "Theft/shrinkage",
  "Returned to supplier",
  "Other",
];

export async function POST(request: NextRequest) {
  try {
    const { staff, storeId } = await requirePermission("inventory.adjust");

    const body = await request.json();
    const { item_id, adjustment, reason, notes } = body;

    if (!item_id || typeof item_id !== "string") {
      return NextResponse.json(
        { error: "item_id is required" },
        { status: 400 }
      );
    }

    if (typeof adjustment !== "number" || adjustment === 0) {
      return NextResponse.json(
        { error: "adjustment must be a non-zero number" },
        { status: 400 }
      );
    }

    if (!reason || !VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        { error: "A valid reason is required" },
        { status: 400 }
      );
    }

    // Verify item belongs to this store
    const item = await prisma.posInventoryItem.findFirst({
      where: { id: item_id, store_id: storeId },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Prevent negative stock
    if (item.quantity + adjustment < 0) {
      return NextResponse.json(
        { error: "Adjustment would result in negative stock" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update inventory quantity
      const updatedItem = await tx.posInventoryItem.update({
        where: { id: item_id, store_id: storeId },
        data: { quantity: { increment: adjustment } },
      });

      // Create ledger entry
      await tx.posLedgerEntry.create({
        data: {
          store_id: storeId,
          staff_id: staff.id,
          type: "adjustment",
          amount_cents: 0,
          description: `Inventory adjustment: ${item.name} ${adjustment > 0 ? "+" : ""}${adjustment} — ${reason}${notes ? ` (${notes})` : ""}`,
          metadata: JSON.parse(
            JSON.stringify({
              item_id,
              item_name: item.name,
              previous_quantity: item.quantity,
              adjustment,
              new_quantity: item.quantity + adjustment,
              reason,
              notes: notes || null,
            })
          ),
        },
      });

      return updatedItem;
    });

    // Fire-and-forget op log
    opLog({
      storeId,
      eventType: "inventory.adjust",
      message: `${item.name}: ${item.quantity} → ${item.quantity + adjustment} (${reason})`,
      metadata: {
        item_id,
        item_name: item.name,
        previous_quantity: item.quantity,
        adjustment,
        new_quantity: item.quantity + adjustment,
        reason,
        notes: notes || undefined,
      },
      staffName: staff.name,
      userId: staff.user_id,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleAuthError(error);
  }
}
