import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

export async function GET(request: NextRequest) {
  try {
    const { db, storeId } = await requireStaff();

    const q = request.nextUrl.searchParams.get("q")?.trim();
    const category = request.nextUrl.searchParams.get("category")?.trim();
    const inStock = request.nextUrl.searchParams.get("in_stock") === "true";

    // Build where clause
    // SECURITY: explicit store_id filter for defense-in-depth
    const where: Record<string, unknown> = { active: true, store_id: storeId };

    if (category) {
      where.category = category;
    }

    if (inStock) {
      where.quantity = { gt: 0 };
    }

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { barcode: q },
        { sku: { contains: q, mode: "insensitive" } },
      ];
    }

    // If no search query and no category, return empty
    if (!q && !category) {
      return NextResponse.json([]);
    }

    const data = await db.posInventoryItem.findMany({
      where,
      orderBy: { name: "asc" },
      take: 50,
    });

    return NextResponse.json(data);
  } catch (error) {
    return handleAuthError(error);
  }
}
