import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import {
  getNetworkStores,
  getNetworkStats,
  getNetworkLeaderboard,
  getStoreBenchmarks,
} from "@/lib/afterroar-network";

/* ------------------------------------------------------------------ */
/*  /api/network — Afterroar Network overview, leaderboard, benchmarks  */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireStaff();

    const action = request.nextUrl.searchParams.get("action") || "overview";

    switch (action) {
      case "overview": {
        const [stores, stats] = await Promise.all([
          getNetworkStores(storeId),
          getNetworkStats(),
        ]);
        return NextResponse.json({ stores, stats });
      }

      case "leaderboard": {
        const game = request.nextUrl.searchParams.get("game") || undefined;
        const format = request.nextUrl.searchParams.get("format") || undefined;
        const leaderboard = await getNetworkLeaderboard({ game, format, limit: 50 });
        return NextResponse.json({ leaderboard });
      }

      case "benchmarks": {
        const benchmarks = await getStoreBenchmarks(storeId);
        return NextResponse.json({ benchmarks });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
