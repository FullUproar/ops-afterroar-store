import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

export async function GET() {
  try {
    const { db } = await requireStaff();

    // Find top 6 items by sales frequency in the last 7 days
    // We look at ledger entries of type 'sale' and count item occurrences in metadata
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentSales = await db.posLedgerEntry.findMany({
      where: {
        type: "sale",
        created_at: { gte: sevenDaysAgo },
      },
      select: { metadata: true },
      orderBy: { created_at: "desc" },
      take: 200,
    });

    // Count item occurrences from metadata.items
    const itemCounts = new Map<string, number>();
    for (const entry of recentSales) {
      const meta = entry.metadata as Record<string, unknown>;
      const items = meta?.items as Array<{ inventory_item_id?: string; quantity?: number }> | undefined;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.inventory_item_id && !item.inventory_item_id.startsWith("unlisted_")) {
            const count = itemCounts.get(item.inventory_item_id) || 0;
            itemCounts.set(item.inventory_item_id, count + (item.quantity || 1));
          }
        }
      }
    }

    if (itemCounts.size === 0) {
      return NextResponse.json([]);
    }

    // Sort by frequency and take top 6
    const topIds = Array.from(itemCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id);

    // Fetch full item details
    const items = await db.posInventoryItem.findMany({
      where: {
        id: { in: topIds },
        active: true,
        quantity: { gt: 0 },
      },
    });

    // Sort by original frequency order
    const ordered = topIds
      .map((id) => items.find((i) => i.id === id))
      .filter(Boolean);

    return NextResponse.json(ordered);
  } catch (error) {
    return handleAuthError(error);
  }
}
