import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requirePermission("inventory.adjust");
    const { id } = await params;

    const po = await db.posPurchaseOrder.findFirst({
      where: { id },
      include: {
        items: {
          include: {
            inventory_item: {
              select: { id: true, name: true, quantity: true },
            },
          },
        },
        supplier: { select: { id: true, name: true } },
      },
    });

    if (!po) {
      return NextResponse.json(
        { error: "Purchase order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(po);
  } catch (error) {
    return handleAuthError(error);
  }
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "cancelled"],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requirePermission("inventory.adjust");
    const { id } = await params;
    const body = await request.json();
    const { status, notes, expected_delivery } = body;

    const po = await db.posPurchaseOrder.findFirst({ where: { id } });
    if (!po) {
      return NextResponse.json(
        { error: "Purchase order not found" },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = { updated_at: new Date() };

    if (status) {
      const allowed = VALID_TRANSITIONS[po.status];
      if (!allowed || !allowed.includes(status)) {
        return NextResponse.json(
          {
            error: `Cannot transition from '${po.status}' to '${status}'`,
          },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    if (notes !== undefined) updateData.notes = notes;
    if (expected_delivery !== undefined) {
      updateData.expected_delivery = expected_delivery
        ? new Date(expected_delivery)
        : null;
    }

    const updated = await db.posPurchaseOrder.update({
      where: { id },
      data: updateData,
      include: { items: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requirePermission("inventory.adjust");
    const { id } = await params;
    const body = await request.json();

    if (body.action === "receive") {
      const { item_id, quantity_received } = body;

      if (!item_id || typeof quantity_received !== "number" || quantity_received <= 0) {
        return NextResponse.json(
          { error: "item_id and positive quantity_received required" },
          { status: 400 }
        );
      }

      const po = await db.posPurchaseOrder.findFirst({
        where: { id },
        include: { items: true },
      });
      if (!po) {
        return NextResponse.json(
          { error: "Purchase order not found" },
          { status: 404 }
        );
      }

      if (po.status === "cancelled" || po.status === "received") {
        return NextResponse.json(
          { error: `Cannot receive items on a ${po.status} PO` },
          { status: 400 }
        );
      }

      const poItem = po.items.find((i) => i.id === item_id);
      if (!poItem) {
        return NextResponse.json(
          { error: "PO item not found" },
          { status: 404 }
        );
      }

      const newReceived = poItem.quantity_received + quantity_received;

      // Update PO item
      await db.posPurchaseOrderItem.update({
        where: { id: item_id },
        data: { quantity_received: newReceived },
      });

      // Update inventory quantity if linked to an item
      if (poItem.inventory_item_id) {
        await db.posInventoryItem.update({
          where: { id: poItem.inventory_item_id },
          data: {
            quantity: { increment: quantity_received },
            updated_at: new Date(),
          },
        });
      }

      // Check if all items are fully received
      const updatedPO = await db.posPurchaseOrder.findFirst({
        where: { id },
        include: { items: true },
      });

      if (updatedPO) {
        const allReceived = updatedPO.items.every(
          (i) => i.quantity_received >= i.quantity_ordered
        );
        const someReceived = updatedPO.items.some(
          (i) => i.quantity_received > 0
        );

        let newStatus = updatedPO.status;
        if (allReceived) {
          newStatus = "received";
        } else if (someReceived && updatedPO.status !== "partially_received") {
          newStatus = "partially_received";
        }

        if (newStatus !== updatedPO.status) {
          await db.posPurchaseOrder.update({
            where: { id },
            data: { status: newStatus, updated_at: new Date() },
          });
        }
      }

      const result = await db.posPurchaseOrder.findFirst({
        where: { id },
        include: {
          items: {
            include: {
              inventory_item: {
                select: { id: true, name: true, quantity: true },
              },
            },
          },
        },
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return handleAuthError(error);
  }
}
