import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { lookupCardPrice } from "@/lib/price-lookup";

/* ------------------------------------------------------------------ */
/*  GET /api/pricing?name=Lightning+Bolt&game=mtg                       */
/*  Look up market price for a TCG card.                                */
/*  Free — uses Scryfall (MTG), pokemontcg.io, ygoprodeck.com.        */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();

    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    const game = url.searchParams.get("game") ?? undefined;
    const set = url.searchParams.get("set") ?? undefined;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const result = await lookupCardPrice(name, game, { set });

    return NextResponse.json(result);
  } catch (error) {
    return handleAuthError(error);
  }
}
