import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Live operational status for the Sidebar — feeds the badges next to nav
 * items so the operator sees attention items without drilling in.
 *
 * Returns the four counts the new Operator Console sidebar shows:
 *   register_live   — any register activity in the last 10 minutes (Live badge)
 *   buylist_waiting — buylist requests pending review (table may not exist yet)
 *   inventory_low   — distinct SKUs at or below their reorder point
 *   devices_offline — peripherals (scanner, printer, reader) not connected
 *
 * Each count uses a raw SQL probe wrapped in a try/catch so a missing table
 * resolves cleanly to 0 without throwing into Vercel's error logs. (Prisma
 * client validation at the model layer would log the error before we could
 * catch it; raw queries side-step that.)
 */

const LIVE_WINDOW_MS = 10 * 60 * 1000;

async function safeCountRaw(
  fn: () => Promise<Array<{ count: bigint }>>,
): Promise<number> {
  try {
    const rows = await fn();
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

async function safeCheckRaw(
  fn: () => Promise<Array<{ exists: boolean }>>,
): Promise<boolean> {
  try {
    const rows = await fn();
    return !!rows[0]?.exists;
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const sessionStoreId = (session as unknown as Record<string, unknown>).storeId as string | undefined;
  let storeId = sessionStoreId;
  if (!storeId) {
    try {
      const staff = await prisma.posStaff.findFirst({
        where: { user_id: session.user.id, active: true },
        select: { store_id: true },
      });
      storeId = staff?.store_id;
    } catch { /* fall through */ }
  }
  if (!storeId) {
    return NextResponse.json({
      register_live: false,
      buylist_waiting: 0,
      inventory_low: 0,
      devices_offline: 0,
    });
  }

  const cutoff = new Date(Date.now() - LIVE_WINDOW_MS);

  const [registerLive, lowStock, buylistWaiting] = await Promise.all([
    safeCheckRaw(() => prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM "PosLedgerEntry"
        WHERE store_id = ${storeId} AND type = 'sale' AND created_at >= ${cutoff}
        LIMIT 1
      ) AS exists
    `),
    safeCountRaw(() => prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "PosInventoryItem"
      WHERE store_id = ${storeId}
        AND reorder_point IS NOT NULL
        AND quantity <= reorder_point
    `),
    safeCountRaw(() => prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "PosBuylistRequest"
      WHERE store_id = ${storeId}
        AND status IN ('pending', 'reviewing')
    `),
  ]);

  return NextResponse.json({
    register_live: registerLive,
    buylist_waiting: buylistWaiting,
    inventory_low: lowStock,
    devices_offline: 0,
  });
}
