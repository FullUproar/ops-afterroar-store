import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  Allocation Pools — manage product allocations for prereleases      */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const { db } = await requirePermission("inventory.adjust");

    const pools = await db.posAllocationPool.findMany({
      orderBy: { created_at: "desc" },
      include: {
        event: { select: { name: true } },
        _count: { select: { preorders: true } },
      },
      take: 100,
    });

    return NextResponse.json(pools);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermission("inventory.adjust");

    const body = await request.json();
    const { product_name, sku, total_allocated, release_date, event_id, notes } = body;

    if (!product_name?.trim()) {
      return NextResponse.json({ error: "Product name is required" }, { status: 400 });
    }
    if (!total_allocated || total_allocated < 1) {
      return NextResponse.json({ error: "Allocation count must be at least 1" }, { status: 400 });
    }

    const pool = await db.posAllocationPool.create({
      data: {
        store_id: storeId,
        product_name: product_name.trim(),
        sku: sku?.trim() || null,
        total_allocated,
        release_date: release_date ? new Date(release_date) : null,
        event_id: event_id || null,
        notes: notes?.trim() || null,
      },
    });

    return NextResponse.json(pool, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { db } = await requirePermission("inventory.adjust");

    const body = await request.json();
    const { id, total_allocated, status, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (total_allocated !== undefined) updates.total_allocated = total_allocated;
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    const updated = await db.posAllocationPool.update({
      where: { id },
      data: updates as { total_allocated?: number; status?: string; notes?: string },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleAuthError(error);
  }
}
