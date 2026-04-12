import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

export async function GET(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") || "out";

    const where: Record<string, unknown> = {};
    if (status === "out") {
      where.status = "out";
    } else if (status === "returned") {
      where.status = "returned";
    } else if (status === "overdue") {
      where.status = "overdue";
    } else if (status !== "all") {
      where.status = "out";
    }

    const checkouts = await db.posGameCheckout.findMany({
      where,
      include: {
        inventory_item: { select: { id: true, name: true, image_url: true, category: true } },
        customer: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
      },
      orderBy: { checked_out_at: "desc" },
    });

    // Add time_elapsed_minutes for each checkout
    const now = Date.now();
    const enriched = checkouts.map((c) => ({
      ...c,
      time_elapsed_minutes: Math.floor(
        (now - new Date(c.checked_out_at).getTime()) / 60000
      ),
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, staff, storeId } = await requireStaff();

    const body = await request.json();
    const { inventory_item_id, customer_id, table_number, duration_hours } = body;

    if (!inventory_item_id) {
      return NextResponse.json(
        { error: "inventory_item_id is required" },
        { status: 400 }
      );
    }

    // Verify item exists, is lendable, and belongs to this store
    const item = await db.posInventoryItem.findFirst({
      where: { id: inventory_item_id },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (!item.lendable) {
      return NextResponse.json(
        { error: "This item is not marked as lendable" },
        { status: 400 }
      );
    }

    // Check if item is currently checked out
    const activeCheckout = await db.posGameCheckout.findFirst({
      where: {
        inventory_item_id,
        status: { in: ["out", "overdue"] },
      },
    });

    if (activeCheckout) {
      return NextResponse.json(
        { error: "This game is already checked out" },
        { status: 409 }
      );
    }

    // Calculate expected return time
    const hours = duration_hours ?? 4;
    const expected_return_at = new Date(Date.now() + hours * 60 * 60 * 1000);

    const checkout = await db.posGameCheckout.create({
      data: {
        store_id: storeId,
        inventory_item_id,
        customer_id: customer_id || null,
        staff_id: staff.id,
        table_number: table_number || null,
        expected_return_at,
        status: "out",
      },
      include: {
        inventory_item: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(checkout, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
