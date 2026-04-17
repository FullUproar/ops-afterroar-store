import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

export async function GET(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const skip = (page - 1) * pageSize;

    const status = searchParams.get("status")?.trim();
    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      db.posOrder.findMany({
        where,
        include: {
          items: true,
          customer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { created_at: "desc" },
        skip,
        take: Math.min(pageSize, 200),
      }),
      db.posOrder.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, pageSize });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requireStaff();
    const body = await request.json();

    const {
      customer_id,
      items,
      subtotal_cents = 0,
      tax_cents = 0,
      shipping_cents = 0,
      discount_cents = 0,
      shipping_method,
      shipping_address,
      notes,
      source = "pos",
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Items required" }, { status: 400 });
    }

    // Generate order number
    const count = await db.posOrder.count({});
    const orderNumber = `ORD-${String(count + 1).padStart(5, "0")}`;

    const totalCents = subtotal_cents + tax_cents + shipping_cents - discount_cents;

    const order = await db.posOrder.create({
      data: {
        store_id: storeId,
        customer_id: customer_id || null,
        order_number: orderNumber,
        source,
        status: "pending",
        subtotal_cents,
        tax_cents,
        shipping_cents,
        discount_cents,
        total_cents: totalCents,
        shipping_method: shipping_method || null,
        shipping_address: shipping_address || null,
        notes: notes || null,
        items: {
          create: items.map((item: { inventory_item_id?: string; name: string; quantity: number; price_cents: number }) => ({
            inventory_item_id: item.inventory_item_id || null,
            name: item.name,
            quantity: item.quantity,
            price_cents: item.price_cents,
            total_cents: item.price_cents * item.quantity,
          })),
        },
      },
      include: { items: true },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
