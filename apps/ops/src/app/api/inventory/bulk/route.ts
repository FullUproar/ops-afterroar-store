import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/inventory/bulk — inventory for offline cache               */
/*  Supports delta sync: ?since=2026-04-08T12:00:00Z                   */
/*  Without ?since: returns full snapshot (first load)                  */
/*  With ?since: returns only items updated since that timestamp        */
/*  This reduces bandwidth from ~500KB/sync to ~5KB/sync (idle store)  */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const url = new URL(request.url);
    const since = url.searchParams.get("since");

    const where: Record<string, unknown> = { active: true };
    if (since) {
      where.updated_at = { gte: new Date(since) };
    }

    const items = await db.posInventoryItem.findMany({
      where,
      select: {
        id: true,
        name: true,
        category: true,
        sku: true,
        barcode: true,
        price_cents: true,
        cost_cents: true,
        quantity: true,
        attributes: true,
        active: true,
      },
    });

    // Also return IDs of items deactivated since last sync (so client can remove them)
    let deactivated: string[] = [];
    if (since) {
      const deactivatedItems = await db.posInventoryItem.findMany({
        where: { active: false, updated_at: { gte: new Date(since) } },
        select: { id: true },
      });
      deactivated = deactivatedItems.map((i) => i.id);
    }

    return NextResponse.json({
      items,
      deactivated,
      syncedAt: new Date().toISOString(),
      full: !since, // true = full snapshot, false = delta
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
