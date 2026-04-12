import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { searchYuGiOhCards, yugiohToCatalogCard, type CatalogYuGiOhCard } from "@/lib/yugioh-api";

/* ------------------------------------------------------------------ */
/*  GET /api/catalog/yugioh?q=blue-eyes — search Yu-Gi-Oh cards        */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { cards: CatalogYuGiOhCard[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) return NextResponse.json({ cards: [], total: 0 });

    const key = `ygo:${q.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ cards: cached.cards, total: cached.cards.length });
    }

    const raw = await searchYuGiOhCards(q);
    const cards = raw.slice(0, 20).map(yugiohToCatalogCard);

    if (cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of cache) { if (now - v.ts > CACHE_TTL) cache.delete(k); }
    }
    cache.set(key, { cards, ts: Date.now() });

    return NextResponse.json({ cards, total: cards.length });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requireStaff();
    const body = await request.json();
    const { yugioh_id, name, set_name, rarity, image_url, price_cents, cost_cents, quantity, condition } = body;

    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const existing = await db.posInventoryItem.findFirst({
      where: { external_id: `yugioh:${yugioh_id}` },
    });

    if (existing) {
      const updated = await db.posInventoryItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: quantity || 1 } },
      });
      return NextResponse.json(updated);
    }

    const item = await db.posInventoryItem.create({
      data: {
        store_id: storeId,
        name: name.trim(),
        category: "tcg_single",
        price_cents: price_cents || 0,
        cost_cents: cost_cents || 0,
        quantity: quantity || 1,
        image_url: image_url || null,
        external_id: `yugioh:${yugioh_id}`,
        attributes: { game: "Yu-Gi-Oh", set: set_name, rarity, condition: condition || "NM", yugioh_id },
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
