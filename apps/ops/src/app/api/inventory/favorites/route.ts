import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

interface QuickItemSetting {
  id: string;
  label: string;
  inventory_id?: string;
  price_cents?: number;
  color?: string;
}

/**
 * GET /api/inventory/favorites
 *
 * Two modes:
 * 1. If the store has configured `settings.quick_items[]` — return those, in
 *    the configured order, hydrated with the live inventory record so the
 *    register UI sees current quantity/price.
 * 2. Otherwise fall back to top-6-by-sales-in-the-last-7-days (auto mode).
 *
 * Quick items can also be plain "labels with a price" (no inventory_id) —
 * useful for cafe drinks or other unlisted items. In that case we synthesize
 * a stub object with the configured label + price.
 */
export async function GET() {
  try {
    const { db, storeId } = await requireStaff();

    // Read configured quick items from store settings
    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });
    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const quickItems = (settings.quick_items as QuickItemSetting[] | undefined) ?? [];

    if (quickItems.length > 0) {
      const linkedIds = quickItems.filter((q) => q.inventory_id).map((q) => q.inventory_id!);
      const items = linkedIds.length
        ? await db.posInventoryItem.findMany({
            where: { id: { in: linkedIds }, active: true },
          })
        : [];
      const itemById = new Map(items.map((i) => [i.id, i]));

      // Hydrate in configured order. Drop entries pointing at deleted items.
      const hydrated = quickItems
        .map((q) => {
          if (q.inventory_id) {
            const live = itemById.get(q.inventory_id);
            if (!live) return null;
            return {
              ...live,
              // The configured label/color overrides the inventory display
              quick_label: q.label,
              quick_color: q.color ?? null,
            };
          }
          // Unlisted quick item — synthesize a stub the register can render
          return {
            id: `quick_${q.id}`,
            store_id: storeId,
            name: q.label,
            category: "other",
            price_cents: q.price_cents ?? 0,
            quantity: 9999,
            active: true,
            attributes: {},
            quick_label: q.label,
            quick_color: q.color ?? null,
          };
        })
        .filter(Boolean);

      return NextResponse.json(hydrated);
    }

    // Auto mode — top 6 by sales frequency in the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentSales = await db.posLedgerEntry.findMany({
      where: { type: "sale", created_at: { gte: sevenDaysAgo } },
      select: { metadata: true },
      orderBy: { created_at: "desc" },
      take: 200,
    });

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

    const topIds = Array.from(itemCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id);

    const items = await db.posInventoryItem.findMany({
      where: { id: { in: topIds }, active: true, quantity: { gt: 0 } },
    });

    const ordered = topIds.map((id) => items.find((i) => i.id === id)).filter(Boolean);

    return NextResponse.json(ordered);
  } catch (error) {
    return handleAuthError(error);
  }
}
