import { NextRequest, NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/fulfillment/pull-sheet                                    */
/*  Consolidated picking list across multiple orders.                  */
/*  Groups items by category, aggregates quantities, lists orders.     */
/* ------------------------------------------------------------------ */

interface PullSheetItem {
  name: string;
  sku: string | null;
  total_quantity: number;
  orders: string[];
  location: string | null;
  inventory_item_id: string | null;
}

interface PullSheetSection {
  category: string;
  items: PullSheetItem[];
}

export async function GET(request: NextRequest) {
  try {
    const { db } = await requirePermissionAndFeature("manage_orders", "ecommerce");

    const url = request.nextUrl;
    const status = url.searchParams.get("status") || "unfulfilled";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 200);

    // Build where clause — same pattern as main fulfillment route
    const where: Record<string, unknown> = {
      source: { not: "pos" },
    };

    if (status.includes(",")) {
      where.fulfillment_status = { in: status.split(",") };
    } else if (status !== "all") {
      where.fulfillment_status = status;
    }

    // Fetch orders with their items and inventory details
    const orders = await db.posOrder.findMany({
      where,
      orderBy: { created_at: "asc" },
      take: limit,
      select: {
        id: true,
        order_number: true,
        items: {
          where: { fulfillment_type: "merchant", fulfilled: false },
          select: {
            id: true,
            name: true,
            quantity: true,
            inventory_item_id: true,
            inventory_item: {
              select: {
                id: true,
                sku: true,
                category: true,
                attributes: true,
              },
            },
          },
        },
      },
    });

    // Aggregate items across orders
    // Key by inventory_item_id when available, otherwise by name
    const itemMap = new Map<string, {
      name: string;
      sku: string | null;
      category: string;
      total_quantity: number;
      orders: Set<string>;
      location: string | null;
      inventory_item_id: string | null;
    }>();

    let totalItems = 0;

    for (const order of orders) {
      for (const item of order.items) {
        const key = item.inventory_item_id || `name:${item.name}`;
        const category = item.inventory_item?.category || "other";
        const attrs = (item.inventory_item?.attributes ?? {}) as Record<string, unknown>;
        const location = (attrs.location as string) || (attrs.bin as string) || (attrs.shelf as string) || null;

        const existing = itemMap.get(key);
        if (existing) {
          existing.total_quantity += item.quantity;
          existing.orders.add(`#${order.order_number}`);
        } else {
          itemMap.set(key, {
            name: item.name,
            sku: item.inventory_item?.sku || null,
            category,
            total_quantity: item.quantity,
            orders: new Set([`#${order.order_number}`]),
            location,
            inventory_item_id: item.inventory_item_id,
          });
        }
        totalItems += item.quantity;
      }
    }

    // Group by category
    const categoryMap = new Map<string, PullSheetItem[]>();

    for (const item of itemMap.values()) {
      const list = categoryMap.get(item.category) || [];
      list.push({
        name: item.name,
        sku: item.sku,
        total_quantity: item.total_quantity,
        orders: Array.from(item.orders),
        location: item.location,
        inventory_item_id: item.inventory_item_id,
      });
      categoryMap.set(item.category, list);
    }

    // Sort categories alphabetically, items within each category alphabetically
    const sections: PullSheetSection[] = Array.from(categoryMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }));

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      order_count: orders.filter((o) => o.items.length > 0).length,
      total_items: totalItems,
      sections,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
