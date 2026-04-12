import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { searchCards } from "@/lib/scryfall";

/* ------------------------------------------------------------------ */
/*  GET /api/catalog/sealed-ev?set=MH3 — Sealed product EV calculator  */
/*  Estimates the expected value of opening a booster box by           */
/*  calculating the average card value across the set.                 */
/*                                                                     */
/*  This is a rough estimate — real EV depends on pull rates which     */
/*  are not publicly disclosed. We use rarity distribution to weight.  */
/* ------------------------------------------------------------------ */

// Approximate cards per booster box (Play Booster, 36 packs)
const RARES_PER_BOX = 36; // 1 rare+ per pack
const MYTHIC_RATE = 1 / 7; // ~1 in 7 rares is a mythic
const FOIL_RATE = 1 / 6; // ~1 in 6 packs has a foil rare

export async function GET(request: NextRequest) {
  try {
    await requireStaff();

    const setCode = request.nextUrl.searchParams.get("set")?.trim();
    if (!setCode || setCode.length < 2) {
      return NextResponse.json({ error: "Set code required (e.g., MH3)" }, { status: 400 });
    }

    // Search Scryfall for all rares and mythics in the set
    const raresResult = await searchCards(`set:${setCode} r:rare`);
    const mythicsResult = await searchCards(`set:${setCode} r:mythic`);

    const rares = raresResult.cards;
    const mythics = mythicsResult.cards;

    if (rares.length === 0 && mythics.length === 0) {
      return NextResponse.json({ error: `No cards found for set ${setCode}` }, { status: 404 });
    }

    // Calculate average value per rarity
    function avgPrice(cards: typeof rares, foil: boolean): number {
      const prices = cards
        .map((c) => {
          const p = foil ? c.prices.usd_foil : c.prices.usd;
          return p ? parseFloat(p) : 0;
        })
        .filter((p) => p > 0);
      return prices.length > 0 ? prices.reduce((s, p) => s + p, 0) / prices.length : 0;
    }

    const avgRarePrice = avgPrice(rares, false);
    const avgMythicPrice = avgPrice(mythics, false);
    const avgRareFoilPrice = avgPrice(rares, true);
    const avgMythicFoilPrice = avgPrice(mythics, true);

    // EV calculation
    const mythicSlots = Math.round(RARES_PER_BOX * MYTHIC_RATE);
    const rareSlots = RARES_PER_BOX - mythicSlots;
    const foilRareSlots = Math.round(RARES_PER_BOX * FOIL_RATE * (1 - MYTHIC_RATE));
    const foilMythicSlots = Math.round(RARES_PER_BOX * FOIL_RATE * MYTHIC_RATE);

    const evDollars =
      (rareSlots * avgRarePrice) +
      (mythicSlots * avgMythicPrice) +
      (foilRareSlots * avgRareFoilPrice) +
      (foilMythicSlots * avgMythicFoilPrice);

    const evCents = Math.round(evDollars * 100);

    // Find top 5 chase cards
    const allCards = [...rares, ...mythics]
      .map((c) => ({
        name: c.name,
        rarity: c.rarity,
        price_usd: c.prices.usd ? parseFloat(c.prices.usd) : 0,
        price_foil_usd: c.prices.usd_foil ? parseFloat(c.prices.usd_foil) : 0,
        image_url: c.image_uris?.small ?? c.card_faces?.[0]?.image_uris?.small ?? null,
      }))
      .sort((a, b) => b.price_usd - a.price_usd);

    const chaseCards = allCards.slice(0, 10);

    return NextResponse.json({
      set_code: setCode.toUpperCase(),
      estimated_ev_cents: evCents,
      estimated_ev_display: `$${(evCents / 100).toFixed(2)}`,
      breakdown: {
        rares_in_set: rares.length,
        mythics_in_set: mythics.length,
        avg_rare_price: `$${avgRarePrice.toFixed(2)}`,
        avg_mythic_price: `$${avgMythicPrice.toFixed(2)}`,
        avg_rare_foil_price: `$${avgRareFoilPrice.toFixed(2)}`,
        avg_mythic_foil_price: `$${avgMythicFoilPrice.toFixed(2)}`,
        estimated_rares_per_box: rareSlots,
        estimated_mythics_per_box: mythicSlots,
      },
      chase_cards: chaseCards,
      disclaimer: "EV is estimated based on average card values and approximate pull rates. Actual results vary significantly.",
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
