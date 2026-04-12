import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/transfers — list transfers for store                       */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { db } = await requirePermission("inventory.adjust");

    const transfers = await db.posTransfer.findMany({
      orderBy: { created_at: "desc" },
      take: 50,
    });

    return NextResponse.json(transfers);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/transfers — create and execute a stock transfer           */
/*  Moves items from one location to another.                           */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { staff, storeId } = await requirePermission("inventory.adjust");

    let body: {
      from_location_id: string;
      to_location_id: string;
      items: Array<{ inventory_item_id: string; quantity: number }>;
      notes?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { from_location_id, to_location_id, items, notes } = body;

    if (!from_location_id || !to_location_id || !items?.length) {
      return NextResponse.json(
        { error: "from_location_id, to_location_id, and items are required" },
        { status: 400 }
      );
    }

    if (from_location_id === to_location_id) {
      return NextResponse.json(
        { error: "Cannot transfer to the same location" },
        { status: 400 }
      );
    }

    // Execute transfer atomically
    const transfer = await prisma.$transaction(async (tx) => {
      // Create the transfer record
      const transferRecord = await tx.posTransfer.create({
        data: {
          store_id: storeId,
          from_location_id,
          to_location_id,
          staff_id: staff.id,
          status: "completed",
          notes: notes ?? null,
          items: JSON.parse(JSON.stringify(items)),
          completed_at: new Date(),
        },
      });

      // Move stock for each item
      for (const item of items) {
        // Decrement source location
        await tx.posInventoryLevel.updateMany({
          where: {
            inventory_item_id: item.inventory_item_id,
            location_id: from_location_id,
          },
          data: { quantity: { decrement: item.quantity } },
        });

        // Increment or create destination level
        const existing = await tx.posInventoryLevel.findUnique({
          where: {
            inventory_item_id_location_id: {
              inventory_item_id: item.inventory_item_id,
              location_id: to_location_id,
            },
          },
        });

        if (existing) {
          await tx.posInventoryLevel.update({
            where: { id: existing.id },
            data: { quantity: { increment: item.quantity } },
          });
        } else {
          await tx.posInventoryLevel.create({
            data: {
              store_id: storeId,
              inventory_item_id: item.inventory_item_id,
              location_id: to_location_id,
              quantity: item.quantity,
            },
          });
        }
      }

      return transferRecord;
    });

    return NextResponse.json(transfer, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
