import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/returns/sales — look up sales for the return wizard       */
/*  Query params: ?q=customer_name or ?ledger_id=xxx                   */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const { storeId, db } = await requirePermission("returns");

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();
    const ledgerId = url.searchParams.get("ledger_id")?.trim();

    // Build where clause for sale ledger entries
    const where: Record<string, unknown> = {
      store_id: storeId,
      type: "sale",
    };

    if (ledgerId) {
      where.id = ledgerId;
    }

    // If searching by customer name, first find matching customer IDs
    let customerIds: string[] | undefined;
    if (q && !ledgerId) {
      const customers = await db.posCustomer.findMany({
        where: {
          name: { contains: q, mode: "insensitive" },
        },
        select: { id: true },
        take: 50,
      });
      customerIds = customers.map((c) => c.id);
      if (customerIds.length === 0) {
        return NextResponse.json([]);
      }
      where.customer_id = { in: customerIds };
    }

    const sales = await db.posLedgerEntry.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: 20,
      include: {
        customer: { select: { id: true, name: true } },
      },
    });

    // For each sale, fetch any existing returns to calculate already-returned quantities
    const saleIds = sales.map((s) => s.id);
    // SECURITY: scope to store_id via tenant client
    const existingReturns = await db.posReturn.findMany({
      where: { original_ledger_entry_id: { in: saleIds } },
      include: { items: true },
    });

    // Build a map: sale_id → { inventory_item_id → total_returned_qty }
    const returnedMap = new Map<string, Map<string, number>>();
    for (const ret of existingReturns) {
      if (!returnedMap.has(ret.original_ledger_entry_id)) {
        returnedMap.set(ret.original_ledger_entry_id, new Map());
      }
      const itemMap = returnedMap.get(ret.original_ledger_entry_id)!;
      for (const item of ret.items) {
        const key = item.inventory_item_id ?? item.name;
        itemMap.set(key, (itemMap.get(key) ?? 0) + item.quantity);
      }
    }

    // Get inventory item names for the items in each sale's metadata
    const allItemIds = new Set<string>();
    for (const sale of sales) {
      const meta = sale.metadata as Record<string, unknown>;
      const items = meta?.items as Array<{ inventory_item_id: string }> | undefined;
      if (items) {
        for (const item of items) {
          allItemIds.add(item.inventory_item_id);
        }
      }
    }

    const inventoryItems = await db.posInventoryItem.findMany({
      where: { id: { in: [...allItemIds] } },
      select: { id: true, name: true, category: true },
    });
    const invMap = new Map(inventoryItems.map((i) => [i.id, i]));

    // Format response
    const rows = sales.map((sale) => {
      const meta = sale.metadata as Record<string, unknown>;
      const saleItems = (meta?.items as Array<{
        inventory_item_id: string;
        quantity: number;
        price_cents: number;
      }>) ?? [];

      const returnedForSale = returnedMap.get(sale.id);

      const items = saleItems.map((si) => {
        const inv = invMap.get(si.inventory_item_id);
        const key = si.inventory_item_id;
        const alreadyReturned = returnedForSale?.get(key) ?? 0;
        return {
          inventory_item_id: si.inventory_item_id,
          name: inv?.name ?? "Unknown Item",
          category: inv?.category ?? null,
          quantity: si.quantity,
          price_cents: si.price_cents,
          already_returned: alreadyReturned,
          max_returnable: si.quantity - alreadyReturned,
        };
      });

      return {
        id: sale.id,
        created_at: sale.created_at,
        customer_id: sale.customer_id,
        customer_name: sale.customer?.name ?? "Guest",
        amount_cents: sale.amount_cents,
        payment_method: (meta?.payment_method as string) ?? "unknown",
        items,
      };
    });

    return NextResponse.json(rows);
  } catch (error) {
    return handleAuthError(error);
  }
}
