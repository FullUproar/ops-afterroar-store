import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { getCard } from "@/lib/scryfall";
import { getPokemonCard } from "@/lib/pokemon-tcg";

/**
 * GET /api/inventory/price-drift?threshold=10
 *
 * Returns inventory items where the current sell price differs from Scryfall
 * market price by more than `threshold` percent (default 10%).
 *
 * Rate-limited: checks at most 10 items per request (Scryfall rate limits).
 * Prioritizes highest-value items first.
 */

interface DriftItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  our_price_cents: number;
  market_price_cents: number;
  drift_percent: number;
  scryfall_id: string;
  condition: string;
  foil: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const thresholdParam = request.nextUrl.searchParams.get("threshold");
    const threshold = thresholdParam ? parseFloat(thresholdParam) : 10;

    // Fetch TCG singles with external IDs (Scryfall or Pokemon), ordered by price descending
    const items = await db.posInventoryItem.findMany({
      where: {
        category: "tcg_single",
        active: true,
        external_id: { not: null },
        quantity: { gt: 0 },
      },
      orderBy: { price_cents: "desc" },
      take: 50, // Pool — we'll check up to 10 of these against Scryfall
      select: {
        id: true,
        name: true,
        category: true,
        quantity: true,
        price_cents: true,
        external_id: true,
        attributes: true,
      },
    });

    const drifted: DriftItem[] = [];
    let checked = 0;
    const MAX_CHECKS = 10;

    for (const item of items) {
      if (checked >= MAX_CHECKS) break;
      if (!item.external_id) continue;

      const attrs = (item.attributes ?? {}) as Record<string, unknown>;
      const condition = (attrs.condition as string) || "NM";
      let marketCents = 0;
      let externalId = item.external_id;
      let isFoil = false;

      try {
        checked++;

        if (item.external_id.startsWith("scryfall:")) {
          // Scryfall lookup
          const parts = item.external_id.split(":");
          const scryfallId = parts[1];
          isFoil = parts[2] === "foil";
          const card = await getCard(scryfallId);
          const priceStr = isFoil ? card.prices.usd_foil : card.prices.usd;
          if (!priceStr) continue;
          marketCents = Math.round(parseFloat(priceStr) * 100);
          externalId = scryfallId;
        } else if (item.external_id.startsWith("pokemon:")) {
          // Pokemon TCG API lookup
          const pokemonId = item.external_id.replace("pokemon:", "");
          const card = await getPokemonCard(pokemonId);
          if (!card) continue;
          // Get best price from TCGPlayer or Cardmarket
          const prices = card.tcgplayer?.prices;
          if (prices) {
            const priceObj = Object.values(prices)[0];
            if (priceObj?.market) marketCents = Math.round(priceObj.market * 100);
            else if (priceObj?.mid) marketCents = Math.round(priceObj.mid * 100);
          }
          externalId = pokemonId;
        } else {
          continue;
        }

        if (marketCents === 0) continue;

        const driftPct =
          Math.abs(item.price_cents - marketCents) / marketCents * 100;

        if (driftPct >= threshold) {
          drifted.push({
            id: item.id,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            our_price_cents: item.price_cents,
            market_price_cents: marketCents,
            drift_percent: Math.round(driftPct * 10) / 10,
            scryfall_id: externalId,
            condition,
            foil: isFoil,
          });
        }
      } catch {
        continue;
      }
    }

    return NextResponse.json({
      items: drifted,
      checked,
      total_eligible: items.length,
      threshold,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
