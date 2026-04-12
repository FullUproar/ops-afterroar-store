import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/**
 * GET /api/catalog/scryfall/check?ids=["scryfall:abc123",...]
 *
 * Check which Scryfall external_ids already exist in inventory.
 * Returns array of matching external_ids.
 */
export async function GET(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const idsParam = request.nextUrl.searchParams.get("ids");
    if (!idsParam) {
      return NextResponse.json([]);
    }

    let prefixes: string[];
    try {
      prefixes = JSON.parse(idsParam);
    } catch {
      return NextResponse.json([]);
    }

    if (!Array.isArray(prefixes) || prefixes.length === 0) {
      return NextResponse.json([]);
    }

    // Build all possible external_ids (both foil and nonfoil variants)
    const allIds: string[] = [];
    for (const prefix of prefixes) {
      // prefix is like "scryfall:abc123"
      allIds.push(`${prefix}:foil`);
      allIds.push(`${prefix}:nonfoil`);
    }

    const existing = await db.posInventoryItem.findMany({
      where: {
        external_id: { in: allIds },
      },
      select: { external_id: true },
    });

    const found = existing
      .map((item) => item.external_id)
      .filter(Boolean) as string[];

    return NextResponse.json(found);
  } catch (error) {
    return handleAuthError(error);
  }
}
