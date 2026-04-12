import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantClient } from "@/lib/tenant-prisma";
import { calculateOffer, type Condition } from "@/lib/tcg-pricing";
import { getStoreSettings } from "@/lib/store-settings-shared";

/* ------------------------------------------------------------------ */
/*  GET /api/buylist/public?store=slug — public buylist for customers   */
/*  No auth required. Rate limited. Cached.                            */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("store");
  if (!slug) {
    return NextResponse.json({ error: "Store slug required" }, { status: 400 });
  }

  // Check cache
  const cached = cache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  const store = await prisma.posStore.findFirst({
    where: { slug },
    select: { id: true, name: true, settings: true },
  });

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const settings = getStoreSettings((store.settings ?? {}) as Record<string, unknown>);
  const db = getTenantClient(store.id);

  // Get TCG singles with prices > $1
  const items = await db.posInventoryItem.findMany({
    where: {
      category: "tcg_single",
      active: true,
      price_cents: { gt: 100 },
    },
    orderBy: { price_cents: "desc" },
    take: 300,
    select: {
      id: true,
      name: true,
      price_cents: true,
      quantity: true,
      attributes: true,
    },
  });

  const buylist = items.map((item) => {
    const attrs = (item.attributes ?? {}) as Record<string, unknown>;
    const marketPrice = item.price_cents;

    return {
      id: item.id,
      name: item.name,
      game: (attrs.game as string) || "MTG",
      set_name: (attrs.set as string) || null,
      market_price_cents: marketPrice,
      offer_nm_cents: calculateOffer({ marketPriceCents: marketPrice, condition: "NM", isFoil: false }),
      offer_lp_cents: calculateOffer({ marketPriceCents: marketPrice, condition: "LP", isFoil: false }),
      offer_mp_cents: calculateOffer({ marketPriceCents: marketPrice, condition: "MP", isFoil: false }),
      current_qty: item.quantity,
      velocity_indicator: item.quantity <= 1 ? "hot" as const : item.quantity >= 5 ? "cold" as const : "normal" as const,
    };
  });

  const result = {
    store_name: store.name,
    buylist,
    total: buylist.length,
    credit_bonus_percent: settings.trade_in_credit_bonus_percent || 0,
    updated_at: new Date().toISOString(),
  };

  // Cache
  if (cache.size > 50) {
    const now = Date.now();
    for (const [k, v] of cache) { if (now - v.ts > CACHE_TTL) cache.delete(k); }
  }
  cache.set(slug, { data: result, ts: Date.now() });

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=600" },
  });
}
