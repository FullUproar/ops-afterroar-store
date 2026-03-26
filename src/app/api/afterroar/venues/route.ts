import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { searchVenues } from "@/lib/hq-bridge";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("store.settings");

    const q = request.nextUrl.searchParams.get("q");
    if (!q || q.length < 2) {
      return NextResponse.json({ error: "Search query (q) must be at least 2 characters" }, { status: 400 });
    }

    const venues = await searchVenues(q);

    return NextResponse.json(venues);
  } catch (error) {
    return handleAuthError(error);
  }
}
