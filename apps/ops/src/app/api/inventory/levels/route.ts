import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/inventory/levels?item_id=xxx — get levels per location    */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const itemId = request.nextUrl.searchParams.get("item_id");
    if (!itemId) {
      return NextResponse.json(
        { error: "item_id is required" },
        { status: 400 }
      );
    }

    const levels = await db.posInventoryLevel.findMany({
      where: { inventory_item_id: itemId },
      include: {
        location: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(
      levels.map((l) => ({
        location_id: l.location_id,
        location_name: l.location.name,
        quantity: l.quantity,
        reserved_quantity: l.reserved_quantity,
      }))
    );
  } catch (error) {
    return handleAuthError(error);
  }
}
