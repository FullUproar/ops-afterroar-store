import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { lookupCardPrice } from "@/lib/price-lookup";
import { calculateOffer, type Condition, DEFAULT_CONDITION_MULTIPLIERS } from "@/lib/tcg-pricing";

/* ------------------------------------------------------------------ */
/*  GET /api/catalog/price-check?name=...&game=...                     */
/*  Live market price lookup + buylist offer calculation                */
/*  Used by: register trade-in, price check panel                      */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    await requireStaff();

    const name = request.nextUrl.searchParams.get("name");
    const game = request.nextUrl.searchParams.get("game") || undefined;
    const set = request.nextUrl.searchParams.get("set") || undefined;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const result = await lookupCardPrice(name, game, { set });

    if (!result.found || !result.prices.market_usd) {
      return NextResponse.json({
        found: false,
        name: result.name,
        source: result.source,
      });
    }

    // Calculate buylist offers for each condition
    const marketCents = result.prices.market_usd;
    const offers: Record<string, number> = {};
    for (const cond of ["NM", "LP", "MP", "HP", "DMG"] as Condition[]) {
      offers[cond] = calculateOffer({
        marketPriceCents: marketCents,
        condition: cond,
        isFoil: false,
      });
    }

    return NextResponse.json({
      found: true,
      name: result.name,
      set_name: result.set_name,
      rarity: result.rarity,
      image_url: result.image_url,
      source: result.source,
      market_price_cents: marketCents,
      market_price_foil_cents: result.prices.market_usd_foil || null,
      offers,
      condition_multipliers: DEFAULT_CONDITION_MULTIPLIERS,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
