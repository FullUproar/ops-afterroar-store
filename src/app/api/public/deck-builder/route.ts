import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  parseDecklistText,
  matchDeckToInventory,
  suggestMetaDecks,
  fetchMetaDeck,
  getRecommendations,
} from "@/lib/deck-builder";

/* ------------------------------------------------------------------ */
/*  POST /api/public/deck-builder — public deck builder API            */
/*  No auth required. Scoped to a store by slug.                       */
/*  Used by: embeddable deck builder widget on Shopify/external sites.  */
/*                                                                     */
/*  Rate limit: rely on Vercel edge rate limiting + cache headers.      */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const storeSlug = body.store as string;
  const action = body.action as string;

  if (!storeSlug || !action) {
    return NextResponse.json({ error: "store and action required" }, { status: 400 });
  }

  // Resolve store
  const store = await prisma.posStore.findFirst({
    where: { slug: storeSlug },
    select: { id: true, name: true },
  });

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  switch (action) {
    case "suggest": {
      const format = body.format as string;
      if (!format) return NextResponse.json({ error: "format required" }, { status: 400 });
      const decks = await suggestMetaDecks(format);
      return NextResponse.json({ decks, store_name: store.name });
    }

    case "fetch_deck": {
      const { archetype, format } = body as { archetype: string; format: string };
      if (!archetype || !format) return NextResponse.json({ error: "archetype and format required" }, { status: 400 });
      const cards = await fetchMetaDeck(archetype as string, format as string);
      const results = await matchDeckToInventory(cards, store.id);
      const recommendations = await getRecommendations(cards, results, store.id, { format: format as string });
      return NextResponse.json({ cards, inventory: results, recommendations, store_name: store.name });
    }

    case "parse_and_match": {
      const decklist = body.decklist as string;
      if (!decklist) return NextResponse.json({ error: "decklist required" }, { status: 400 });
      const cards = parseDecklistText(decklist);
      const results = await matchDeckToInventory(cards, store.id);
      const recommendations = await getRecommendations(cards, results, store.id);
      return NextResponse.json({ cards, inventory: results, recommendations, store_name: store.name });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
