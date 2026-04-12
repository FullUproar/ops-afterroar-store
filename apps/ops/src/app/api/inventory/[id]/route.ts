import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db, storeId } = await requireStaff();

    const item = await db.posInventoryItem.findFirst({
      where: { id, store_id: storeId },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Fetch recent sales from ledger entries where metadata contains this item
    const salesEntries = await db.posLedgerEntry.findMany({
      where: {
        store_id: storeId,
        type: { in: ["sale", "refund"] },
        description: { contains: item.name, mode: "insensitive" },
      },
      include: {
        customer: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
      },
      orderBy: { created_at: "desc" },
      take: 20,
    });

    const sales = salesEntries.map((entry) => {
      const meta = (entry.metadata ?? {}) as Record<string, unknown>;
      return {
        id: entry.id,
        type: entry.type,
        amount_cents: entry.amount_cents,
        description: entry.description,
        customer_name: entry.customer?.name ?? null,
        staff_name: entry.staff?.name ?? null,
        metadata: meta,
        created_at: entry.created_at.toISOString(),
      };
    });

    return NextResponse.json({ item, sales });
  } catch (error) {
    return handleAuthError(error);
  }
}
