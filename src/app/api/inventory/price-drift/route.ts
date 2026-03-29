import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { getCard } from "@/lib/scryfall";

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

    // Fetch TCG singles with Scryfall IDs, ordered by price descending
    const items = await db.posInventoryItem.findMany({
      where: {
        category: "tcg_single",
        active: true,
        external_id: { startsWith: "scryfall:" },
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

      // Parse scryfall ID from external_id format: "scryfall:{id}:{foil|nonfoil}"
      const parts = item.external_id!.split(":");
      if (parts.length < 2) continue;

      const scryfallId = parts[1];
      const isFoil = parts[2] === "foil";
      const attrs = (item.attributes ?? {}) as Record<string, unknown>;
      const condition = (attrs.condition as string) || "NM";

      try {
        checked++;
        const card = await getCard(scryfallId);
        const priceStr = isFoil ? card.prices.usd_foil : card.prices.usd;
        if (!priceStr) continue;

        const marketCents = Math.round(parseFloat(priceStr) * 100);
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
            scryfall_id: scryfallId,
            condition,
            foil: isFoil,
          });
        }
      } catch {
        // Skip items where Scryfall lookup fails
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
