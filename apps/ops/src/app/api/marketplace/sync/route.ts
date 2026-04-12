import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pullEbayOrders, pullCardTraderOrders, pullManaPoolOrders, pushFullInventorySync } from "@/lib/marketplace-sync";

/* ------------------------------------------------------------------ */
/*  /api/marketplace/sync — Marketplace sync cron + manual trigger     */
/*                                                                     */
/*  GET:  Cron job — pulls orders from all marketplaces for all stores */
/*        Auth: CRON_SECRET bearer token (Vercel Cron)                 */
/*  POST: Manual trigger — pulls orders + pushes inventory for a store */
/*        Auth: Staff session (requirePermission)                      */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  // Cron auth
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find all stores with marketplace sync enabled
  const stores = await prisma.posStore.findMany({
    where: {
      settings: {
        path: ["marketplace_sync_enabled"],
        equals: true,
      },
    },
    select: { id: true, name: true },
  });

  const results: Record<string, unknown> = {};

  for (const store of stores) {
    try {
      const [ebayResult, cardtraderResult, manapoolResult] = await Promise.all([
        pullEbayOrders(store.id),
        pullCardTraderOrders(store.id),
        pullManaPoolOrders(store.id),
      ]);
      results[store.name] = {
        ebay: ebayResult,
        cardtrader: cardtraderResult,
        manapool: manapoolResult,
      };
    } catch (err) {
      results[store.name] = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json({
    stores_synced: stores.length,
    results,
    synced_at: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  // Manual trigger — use staff auth
  const { requirePermissionAndFeature, handleAuthError } = await import("@/lib/require-staff");

  try {
    const { storeId } = await requirePermissionAndFeature("inventory.adjust", "ecommerce");

    const body = await request.json().catch(() => ({}));
    const action = (body as Record<string, string>).action || "full";

    const results: Record<string, unknown> = {};

    if (action === "full" || action === "pull") {
      const [ebay, cardtrader, manapool] = await Promise.all([
        pullEbayOrders(storeId),
        pullCardTraderOrders(storeId),
        pullManaPoolOrders(storeId),
      ]);
      results.orders = { ebay, cardtrader, manapool };
    }

    if (action === "full" || action === "push") {
      results.inventory = await pushFullInventorySync(storeId);
    }

    return NextResponse.json(results);
  } catch (error) {
    return handleAuthError(error);
  }
}
