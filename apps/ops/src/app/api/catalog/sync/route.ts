import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { syncScryfallBulkData, getSyncStatus } from "@/lib/scryfall-sync";

/**
 * GET /api/catalog/sync — Check sync status (last sync time, card count)
 */
export async function GET() {
  try {
    await requirePermission("store.settings");
    const status = await getSyncStatus();
    return NextResponse.json(status);
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * POST /api/catalog/sync — Trigger a Scryfall bulk sync (admin only)
 * Also called by Vercel Cron (4 AM daily).
 * Long-running: streams progress via console, returns final result.
 */
export const maxDuration = 300; // 5 minutes max for Vercel

export async function POST(request: Request) {
  // Allow Vercel Cron calls (Authorization: Bearer <CRON_SECRET>)
  const authHeader = request.headers.get("authorization");
  const isCron =
    process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
    try {
      await requirePermission("store.settings");
    } catch (error) {
      return handleAuthError(error);
    }
  }

  try {
    console.log("[Scryfall Sync] Sync triggered via API");
    const result = await syncScryfallBulkData();

    if (result.error) {
      return NextResponse.json(
        { ok: false, error: result.error, ...result },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[Scryfall Sync] Unhandled error:", err);
    return NextResponse.json(
      { ok: false, error: "Sync failed unexpectedly" },
      { status: 500 }
    );
  }
}
