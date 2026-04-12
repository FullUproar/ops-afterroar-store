import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

export async function GET() {
  try {
    const { db, storeId } = await requireStaff();
    const notifications: Array<{
      id: string;
      type: string;
      title: string;
      detail: string;
      href: string;
    }> = [];

    // 1. Low stock items (quantity <= low_stock_threshold)
    try {
      const lowStock = await db.posInventoryItem.findMany({
        where: {
          active: true,
          quantity: { lte: 5 }, // Will be compared per-item below
        },
        orderBy: { quantity: "asc" },
        take: 20,
      });

      const actualLow = lowStock
        .filter((item) => item.quantity <= item.low_stock_threshold)
        .slice(0, 5);

      for (const item of actualLow) {
        notifications.push({
          id: `low_stock_${item.id}`,
          type: "low_stock",
          title: `Low stock: ${item.name}`,
          detail: `${item.quantity} remaining (threshold: ${item.low_stock_threshold})`,
          href: "/dashboard/inventory",
        });
      }
    } catch {
      // Table/query issue, skip
    }

    // 2. Overdue game checkouts
    try {
      const overdue = await db.posGameCheckout.findMany({
        where: {
          status: "out",
          expected_return_at: { lt: new Date() },
        },
        include: { inventory_item: { select: { name: true } } },
        orderBy: { expected_return_at: "asc" },
        take: 5,
      });

      for (const checkout of overdue) {
        notifications.push({
          id: `overdue_${checkout.id}`,
          type: "overdue_checkout",
          title: `Overdue: ${checkout.inventory_item.name}`,
          detail: checkout.table_number
            ? `Table ${checkout.table_number}`
            : "No table assigned",
          href: "/dashboard/game-library",
        });
      }
    } catch {
      // Table might not exist yet
    }

    // 3. Events today
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const events = await db.posEvent.findMany({
        where: {
          starts_at: { gte: todayStart, lte: todayEnd },
        },
        orderBy: { starts_at: "asc" },
        take: 3,
      });

      for (const event of events) {
        const time = new Date(event.starts_at).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        });
        notifications.push({
          id: `event_${event.id}`,
          type: "event_today",
          title: event.name,
          detail: `Today at ${time}`,
          href: "/dashboard/events",
        });
      }
    } catch {
      // Skip
    }

    // 4. Pending purchase orders (submitted, awaiting delivery)
    try {
      const pendingPOs = await db.posPurchaseOrder.findMany({
        where: {
          status: "submitted",
        },
        orderBy: { order_date: "desc" },
        take: 3,
      });

      for (const po of pendingPOs) {
        notifications.push({
          id: `po_${po.id}`,
          type: "po_pending",
          title: `PO: ${po.supplier_name}`,
          detail: po.expected_delivery
            ? `Expected ${new Date(po.expected_delivery).toLocaleDateString()}`
            : "No delivery date set",
          href: "/dashboard/purchase-orders",
        });
      }
    } catch {
      // Skip
    }

    return NextResponse.json(notifications);
  } catch (error) {
    return handleAuthError(error);
  }
}
