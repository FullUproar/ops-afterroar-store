import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { generateInsights, type Insight } from "@/lib/store-intelligence";

/* ------------------------------------------------------------------ */
/*  GET /api/intelligence — AI-powered store insights                  */
/*  Cached for 5 minutes per store to avoid recalculating on reload.   */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { insights: Insight[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: Request) {
  try {
    const { db, storeId } = await requirePermission("reports");

    // Check for force-refresh via query param
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";

    // Check cache
    const cached = cache.get(storeId);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        insights: cached.insights,
        cached: true,
        generated_at: new Date(cached.timestamp).toISOString(),
      });
    }

    // Generate fresh insights
    const insights = await generateInsights(db, storeId);

    // Update cache
    cache.set(storeId, { insights, timestamp: Date.now() });

    return NextResponse.json({
      insights,
      cached: false,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
