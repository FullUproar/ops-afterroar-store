import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  GET /api/network/stock — search partner stores for a card/product  */
/*                                                                     */
/*  "We don't have it, but Dice & Dragons does (8 miles away)."         */
/*                                                                     */
/*  Only searches stores that have opted in to network_inventory.       */
/*  Returns: store name, city/state, quantity — never pricing.          */
/*                                                                     */
/*  Query: ?q=Lightning Bolt  (name search)                            */
/*         ?sku=FU-HYD-001    (exact SKU)                              */
/*         ?oracle_id=xxx     (functional card match)                  */
/* ------------------------------------------------------------------ */

interface NetworkStockResult {
  store_name: string;
  store_slug: string;
  city: string | null;
  state: string | null;
  quantity: number;
  item_name: string;
  condition?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireStaff();

    const params = request.nextUrl.searchParams;
    const query = params.get("q");
    const sku = params.get("sku");
    const oracleId = params.get("oracle_id");

    if (!query && !sku && !oracleId) {
      return NextResponse.json({ error: "q, sku, or oracle_id required" }, { status: 400 });
    }

    // Find stores that opted into network inventory sharing
    const networkStores = await prisma.posStore.findMany({
      where: {
        id: { not: storeId }, // exclude the requesting store
        settings: {
          path: ["network_inventory_enabled"],
          equals: true,
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        settings: true,
      },
    });

    if (networkStores.length === 0) {
      return NextResponse.json({ results: [], message: "No partner stores in network yet" });
    }

    const networkStoreIds = networkStores.map((s) => s.id);

    // Build inventory search
    const where: Record<string, unknown> = {
      store_id: { in: networkStoreIds },
      active: true,
      quantity: { gt: 0 },
    };

    if (sku) {
      where.sku = sku;
    } else if (oracleId) {
      where.oracle_id = oracleId;
    } else if (query) {
      where.name = { contains: query, mode: "insensitive" };
    }

    const items = await prisma.posInventoryItem.findMany({
      where,
      select: {
        store_id: true,
        name: true,
        quantity: true,
        attributes: true,
      },
      take: 50,
    });

    // Build store lookup
    const storeMap = new Map(
      networkStores.map((s) => {
        const addr = (s.address ?? {}) as Record<string, string>;
        const settings = (s.settings ?? {}) as Record<string, unknown>;
        const visible = settings.network_inventory_visible !== false;
        return [
          s.id,
          {
            name: visible ? s.name : "Partner Store",
            slug: s.slug,
            city: visible ? (addr.city || null) : null,
            state: visible ? (addr.state || null) : null,
          },
        ];
      }),
    );

    // Aggregate by store
    const byStore = new Map<string, NetworkStockResult>();

    for (const item of items) {
      const store = storeMap.get(item.store_id);
      if (!store) continue;

      const key = `${item.store_id}:${item.name}`;
      const existing = byStore.get(key);
      const attrs = (item.attributes ?? {}) as Record<string, unknown>;

      if (existing) {
        existing.quantity += item.quantity;
      } else {
        byStore.set(key, {
          store_name: store.name,
          store_slug: store.slug,
          city: store.city,
          state: store.state,
          quantity: item.quantity,
          item_name: item.name,
          condition: (attrs.condition as string) || undefined,
        });
      }
    }

    const results = Array.from(byStore.values()).sort((a, b) => b.quantity - a.quantity);

    return NextResponse.json({ results });
  } catch (error) {
    return handleAuthError(error);
  }
}
