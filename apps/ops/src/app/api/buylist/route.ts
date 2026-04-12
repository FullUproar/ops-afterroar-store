import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { calculateOffer, type Condition, DEFAULT_PRICING_CONFIG } from "@/lib/tcg-pricing";
import { formatCents } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  GET /api/buylist — auto-generated buylist from current inventory    */
/*  Returns cards the store would buy, with auto-calculated offers.    */
/*  POST /api/buylist — generate offers for a list of cards            */
/* ------------------------------------------------------------------ */

interface BuylistItem {
  id: string;
  name: string;
  game: string;
  set_name: string | null;
  market_price_cents: number;
  offer_nm_cents: number;
  offer_lp_cents: number;
  offer_mp_cents: number;
  current_qty: number;
  velocity_indicator: "hot" | "normal" | "cold";
}

export async function GET() {
  try {
    const { db } = await requirePermission("trade_ins");

    // Get all TCG singles with prices, sorted by value
    const items = await db.posInventoryItem.findMany({
      where: {
        category: "tcg_single",
        active: true,
        price_cents: { gt: 100 }, // Only cards worth more than $1
      },
      orderBy: { price_cents: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        price_cents: true,
        cost_cents: true,
        quantity: true,
        attributes: true,
      },
    });

    const buylist: BuylistItem[] = items.map((item) => {
      const attrs = (item.attributes ?? {}) as Record<string, unknown>;
      const marketPrice = item.price_cents;

      // Calculate offers at different conditions
      const offerNM = calculateOffer({ marketPriceCents: marketPrice, condition: "NM", isFoil: false });
      const offerLP = calculateOffer({ marketPriceCents: marketPrice, condition: "LP", isFoil: false });
      const offerMP = calculateOffer({ marketPriceCents: marketPrice, condition: "MP", isFoil: false });

      // Velocity indicator based on stock level
      const velocity: "hot" | "normal" | "cold" =
        item.quantity <= 1 ? "hot" :
        item.quantity >= 5 ? "cold" :
        "normal";

      return {
        id: item.id,
        name: item.name,
        game: (attrs.game as string) || "MTG",
        set_name: (attrs.set as string) || null,
        market_price_cents: marketPrice,
        offer_nm_cents: offerNM,
        offer_lp_cents: offerLP,
        offer_mp_cents: offerMP,
        current_qty: item.quantity,
        velocity_indicator: velocity,
      };
    });

    return NextResponse.json({
      buylist,
      total: buylist.length,
      config: {
        buylist_percent: DEFAULT_PRICING_CONFIG.buylistPercent,
        round_to: DEFAULT_PRICING_CONFIG.roundTo,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** POST /api/buylist — generate offers for specific cards by name */
export async function POST(request: Request) {
  try {
    await requirePermission("trade_ins");

    const body = await request.json();
    const { cards } = body as { cards: Array<{ name: string; market_price_cents: number; condition?: string; foil?: boolean }> };

    if (!cards || !Array.isArray(cards)) {
      return NextResponse.json({ error: "cards array required" }, { status: 400 });
    }

    const offers = cards.map((card) => {
      const condition = (card.condition || "LP") as Condition;
      const offer = calculateOffer({
        marketPriceCents: card.market_price_cents,
        condition,
        isFoil: card.foil || false,
      });

      return {
        name: card.name,
        market_price_cents: card.market_price_cents,
        condition,
        foil: card.foil || false,
        offer_cents: offer,
        offer_display: formatCents(offer),
      };
    });

    return NextResponse.json({ offers });
  } catch (error) {
    return handleAuthError(error);
  }
}
