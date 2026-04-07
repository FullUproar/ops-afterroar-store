import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pushInventoryToShopify } from "@/lib/shopify-sync";

/* ------------------------------------------------------------------ */
/*  GET /api/cron/expire-holds — Vercel Cron                           */
/*                                                                     */
/*  Finds all active holds past their expires_at timestamp and marks   */
/*  them expired. Then pushes updated inventory to Shopify so the      */
/*  online allocation is restored.                                     */
/*                                                                     */
/*  Auth: CRON_SECRET bearer token                                     */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find all expired holds that are still active
  const expiredHolds = await prisma.posInventoryHold.findMany({
    where: {
      status: "active",
      expires_at: { lt: now },
    },
    select: {
      id: true,
      store_id: true,
      item_id: true,
      quantity: true,
      item: {
        select: { shopify_inventory_item_id: true },
      },
    },
  });

  if (expiredHolds.length === 0) {
    return NextResponse.json({ expired: 0 });
  }

  // Batch update all expired holds
  await prisma.posInventoryHold.updateMany({
    where: {
      id: { in: expiredHolds.map((h) => h.id) },
    },
    data: {
      status: "expired",
      released_at: now,
    },
  });

  // Collect unique store+item pairs that need Shopify sync
  const syncTargets = new Map<string, { storeId: string; itemId: string }>();
  for (const hold of expiredHolds) {
    if (hold.item.shopify_inventory_item_id) {
      const key = `${hold.store_id}:${hold.item_id}`;
      if (!syncTargets.has(key)) {
        syncTargets.set(key, { storeId: hold.store_id, itemId: hold.item_id });
      }
    }
  }

  // Fire-and-forget: push updated inventory to Shopify
  let syncErrors = 0;
  for (const { storeId, itemId } of syncTargets.values()) {
    try {
      await pushInventoryToShopify(storeId, itemId);
    } catch (err) {
      syncErrors++;
      console.error(
        `[ExpireHolds] Shopify sync failed for store=${storeId} item=${itemId}:`,
        err,
      );
    }
  }

  console.log(
    `[ExpireHolds] Expired ${expiredHolds.length} holds, synced ${syncTargets.size} items to Shopify (${syncErrors} errors)`,
  );

  return NextResponse.json({
    expired: expiredHolds.length,
    shopify_synced: syncTargets.size,
    shopify_errors: syncErrors,
  });
}
