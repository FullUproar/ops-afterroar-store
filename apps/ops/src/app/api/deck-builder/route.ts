import { NextRequest, NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";
import {
  searchDecklists,
  parseDecklistText,
  matchDeckToInventory,
  suggestMetaDecks,
  fetchMetaDeck,
  buildCommanderDeck,
  searchCommanders,
  fetchTopPokemonDecks,
  getRecommendations,
} from "@/lib/deck-builder";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermissionAndFeature("checkout", "tcg_engine");

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "search": {
        const { query, format } = body;
        if (!query || typeof query !== "string") {
          return NextResponse.json({ error: "query is required" }, { status: 400 });
        }
        const cards = await searchDecklists(query, format);
        return NextResponse.json({ cards });
      }

      case "parse": {
        const { decklist } = body;
        if (!decklist || typeof decklist !== "string") {
          return NextResponse.json({ error: "decklist is required" }, { status: 400 });
        }
        const cards = parseDecklistText(decklist);
        return NextResponse.json({ cards });
      }

      case "match": {
        const { cards, format, colors, in_stock_only } = body;
        if (!Array.isArray(cards)) {
          return NextResponse.json({ error: "cards array is required" }, { status: 400 });
        }
        const results = await matchDeckToInventory(cards, ctx.storeId, { inStockOnly: !!in_stock_only });
        const recommendations = await getRecommendations(cards, results, ctx.storeId, { format, colors });
        return NextResponse.json({ results, recommendations });
      }

      case "suggest": {
        const { format, game } = body;
        if (!format || typeof format !== "string") {
          return NextResponse.json({ error: "format is required" }, { status: 400 });
        }
        const decks = await suggestMetaDecks(format, game);
        return NextResponse.json({ decks });
      }

      /* ---- New actions ---- */

      case "meta": {
        const { format, game } = body;
        if (!format || typeof format !== "string") {
          return NextResponse.json({ error: "format is required" }, { status: 400 });
        }
        const archetypes = await suggestMetaDecks(format, game);
        return NextResponse.json({ archetypes });
      }

      case "fetch_deck": {
        const { archetype, format } = body;
        if (!archetype || !format) {
          return NextResponse.json(
            { error: "archetype and format are required" },
            { status: 400 },
          );
        }
        const cards = await fetchMetaDeck(archetype, format);
        if (cards.length === 0) {
          return NextResponse.json(
            { cards: [], message: "Could not fetch decklist" },
          );
        }
        // Match against inventory + generate recommendations
        const results = await matchDeckToInventory(cards, ctx.storeId);
        const recommendations = await getRecommendations(cards, results, ctx.storeId, { format });
        return NextResponse.json({ cards, inventory: results, recommendations });
      }

      case "commander": {
        const { commander } = body;
        if (!commander || typeof commander !== "string") {
          return NextResponse.json(
            { error: "commander name is required" },
            { status: 400 },
          );
        }
        const result = await buildCommanderDeck(commander, ctx.storeId);
        if (!result) {
          return NextResponse.json(
            { error: "Commander not found on EDHREC" },
            { status: 404 },
          );
        }
        return NextResponse.json(result);
      }

      case "commander_search": {
        const { query } = body;
        if (!query || typeof query !== "string") {
          return NextResponse.json(
            { error: "query is required" },
            { status: 400 },
          );
        }
        const results = await searchCommanders(query);
        return NextResponse.json({ commanders: results });
      }

      case "pokemon_meta": {
        const { limit } = body;
        const decks = await fetchTopPokemonDecks(
          typeof limit === "number" ? limit : 8,
        );
        return NextResponse.json({ decks });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
