import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requireStaff();
    const { id } = await params;

    const order = await db.posOrder.findFirst({
      where: { id },
      include: {
        items: {
          include: {
            inventory_item: { select: { id: true, name: true, barcode: true, sku: true } },
          },
        },
        customer: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { storeId, db } = await requireStaff();
    const { id } = await params;
    const body = await request.json();

    // Verify order belongs to store
    const existing = await db.posOrder.findFirst({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const update: Record<string, unknown> = { updated_at: new Date() };

    if (body.status) {
      update.status = body.status;

      // Auto-set timestamp fields based on status
      if (body.status === "processing") {
        update.fulfilled_at = new Date();
      }
      if (body.status === "shipped") {
        update.shipped_at = new Date();
      }
      if (body.status === "delivered") {
        update.delivered_at = new Date();
      }
    }

    if (body.tracking_number !== undefined) {
      update.tracking_number = body.tracking_number;
    }
    if (body.tracking_url !== undefined) {
      update.tracking_url = body.tracking_url;
    }
    if (body.shipping_method !== undefined) {
      update.shipping_method = body.shipping_method;
    }
    if (body.notes !== undefined) {
      update.notes = body.notes;
    }

    // Update individual item fulfillment status (order_id verified above)
    if (body.fulfilled_items && Array.isArray(body.fulfilled_items)) {
      for (const itemId of body.fulfilled_items) {
        await prisma.posOrderItem.updateMany({
          where: { id: itemId, order_id: id },
          data: { fulfilled: true },
        });
      }
    }

    // SECURITY: scope update via tenant client
    const order = await db.posOrder.update({
      where: { id },
      data: update,
      include: {
        items: true,
        customer: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(order);
  } catch (error) {
    return handleAuthError(error);
  }
}
