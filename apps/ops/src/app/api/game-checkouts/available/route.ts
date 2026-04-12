import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

export async function GET() {
  try {
    const { db } = await requireStaff();

    // Get all lendable items
    const lendableItems = await db.posInventoryItem.findMany({
      where: { lendable: true, active: true },
      orderBy: { name: "asc" },
    });

    // Get all active checkouts (out or overdue)
    const activeCheckouts = await db.posGameCheckout.findMany({
      where: { status: { in: ["out", "overdue"] } },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });

    // Build a map of item_id → checkout info
    const checkoutMap = new Map<string, typeof activeCheckouts[number]>();
    for (const co of activeCheckouts) {
      checkoutMap.set(co.inventory_item_id, co);
    }

    const now = Date.now();
    const result = lendableItems.map((item) => {
      const checkout = checkoutMap.get(item.id);
      if (checkout) {
        return {
          ...item,
          available: false,
          checkout: {
            id: checkout.id,
            customer_name: checkout.customer?.name || null,
            table_number: checkout.table_number,
            checked_out_at: checkout.checked_out_at,
            expected_return_at: checkout.expected_return_at,
            status: checkout.status,
            time_elapsed_minutes: Math.floor(
              (now - new Date(checkout.checked_out_at).getTime()) / 60000
            ),
          },
        };
      }
      return {
        ...item,
        available: true,
        checkout: null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleAuthError(error);
  }
}
