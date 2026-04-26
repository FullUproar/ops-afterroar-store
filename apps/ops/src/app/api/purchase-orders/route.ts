import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

export async function GET() {
  try {
    const { db } = await requirePermission("inventory.adjust");

    const data = await db.posPurchaseOrder.findMany({
      orderBy: { created_at: "desc" },
      include: {
        items: true,
        supplier: { select: { id: true, name: true } },
      },
    });

    const result = data.map((po) => ({
      ...po,
      item_count: po.items.length,
      total_cost_cents: po.items.reduce(
        (sum, i) => sum + i.cost_cents * i.quantity_ordered,
        0
      ),
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermission("inventory.adjust");

    const body = await request.json();
    const {
      supplier_id,
      supplier_name,
      expected_delivery,
      notes,
      items,
      freight_cents,
      tax_cents,
      other_fees_cents,
      cost_allocation,
    } = body;

    if (!supplier_name || typeof supplier_name !== "string") {
      return NextResponse.json(
        { error: "Supplier name is required" },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "At least one item is required" },
        { status: 400 }
      );
    }

    const totalCost = items.reduce(
      (sum: number, i: { cost_cents: number; quantity_ordered: number }) =>
        sum + i.cost_cents * i.quantity_ordered,
      0
    );

    const validAllocs = ["by_cost", "by_weight", "even"] as const;
    const alloc = validAllocs.includes(cost_allocation) ? cost_allocation : "by_cost";

    const po = await db.posPurchaseOrder.create({
      data: {
        store_id: storeId,
        supplier_id: supplier_id || null,
        supplier_name: supplier_name.trim(),
        expected_delivery: expected_delivery
          ? new Date(expected_delivery)
          : null,
        notes: notes || null,
        total_cost_cents: totalCost,
        freight_cents: typeof freight_cents === "number" && freight_cents >= 0 ? freight_cents : 0,
        tax_cents: typeof tax_cents === "number" && tax_cents >= 0 ? tax_cents : 0,
        other_fees_cents: typeof other_fees_cents === "number" && other_fees_cents >= 0 ? other_fees_cents : 0,
        cost_allocation: alloc,
        items: {
          create: items.map(
            (item: {
              inventory_item_id?: string;
              name: string;
              sku?: string;
              quantity_ordered: number;
              cost_cents: number;
            }) => ({
              inventory_item_id: item.inventory_item_id || null,
              name: item.name,
              sku: item.sku || null,
              quantity_ordered: item.quantity_ordered,
              cost_cents: item.cost_cents,
            })
          ),
        },
      },
      include: { items: true },
    });

    return NextResponse.json(po, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
