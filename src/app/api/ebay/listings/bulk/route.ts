import { NextRequest, NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";
import { getEbayClient } from "@/lib/ebay";

/* ------------------------------------------------------------------ */
/*  POST /api/ebay/listings/bulk — list all eligible singles on eBay   */
/*  Body: { min_price_cents?, min_quantity?, game?, limit? }           */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { db } = await requirePermissionAndFeature("inventory.adjust", "ecommerce");

    const ebay = getEbayClient();
    if (!ebay) {
      return NextResponse.json(
        { error: "eBay not configured. Set EBAY_USER_TOKEN env var." },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      min_price_cents = 100, // Default: only list items $1+
      min_quantity = 1,
      game,
      limit = 500,
    } = body as {
      min_price_cents?: number;
      min_quantity?: number;
      game?: string;
      limit?: number;
    };

    // Find all eligible unlisted singles
    const where: Record<string, unknown> = {
      category: "tcg_single",
      active: true,
      listed_on_ebay: false,
      quantity: { gte: min_quantity },
      price_cents: { gte: min_price_cents },
    };

    if (game) {
      where.attributes = { path: ["game"], equals: game };
    }

    const items = await db.posInventoryItem.findMany({
      where,
      orderBy: { price_cents: "desc" }, // Most expensive first
      take: Math.min(limit, 500),
      select: {
        id: true,
        name: true,
        price_cents: true,
        quantity: true,
        image_url: true,
        attributes: true,
      },
    });

    if (items.length === 0) {
      return NextResponse.json({
        listed: 0,
        errors: [],
        message: "No eligible items to list",
      });
    }

    const report = {
      listed: 0,
      errors: [] as string[],
      total_attempted: items.length,
    };

    for (const item of items) {
      const attrs = (item.attributes ?? {}) as Record<string, unknown>;
      const condition = (attrs.condition as string) || "NM";
      const itemGame = (attrs.game as string) || "MTG";
      const setName = (attrs.set_name as string) || "";
      const rarity = (attrs.rarity as string) || "";
      const foil = (attrs.foil as boolean) || false;
      const sku = `afterroar-${item.id}`;

      const imageUrls = item.image_url ? [item.image_url] : [];
      const description = [
        item.name,
        setName && `Set: ${setName}`,
        `Condition: ${condition}`,
        foil && "Foil",
        rarity && `Rarity: ${rarity}`,
      ]
        .filter(Boolean)
        .join(" | ");

      try {
        const result = await ebay.listSingle({
          sku,
          title: item.name.slice(0, 80),
          condition,
          priceCents: item.price_cents,
          quantity: item.quantity,
          description,
          imageUrls,
          game: itemGame,
          setName,
          rarity,
        });

        await db.posInventoryItem.update({
          where: { id: item.id },
          data: {
            ebay_listing_id: result.listingId,
            ebay_offer_id: result.offerId,
            listed_on_ebay: true,
            updated_at: new Date(),
          },
        });

        report.listed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        report.errors.push(`${item.name}: ${msg}`);

        // If we hit rate limit, stop
        if (msg.includes("429") || msg.includes("rate")) {
          report.errors.push("Rate limited — stopping bulk listing");
          break;
        }
      }
    }

    return NextResponse.json({
      ...report,
      message: `Listed ${report.listed}/${report.total_attempted} items, ${report.errors.length} errors`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
