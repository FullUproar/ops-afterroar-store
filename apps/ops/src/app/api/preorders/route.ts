import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/preorders — list preorders for store                       */
/*  Query: ?status=pending, ?customer_id=xxx                            */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const customerId = url.searchParams.get("customer_id");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (customerId) where.customer_id = customerId;

    const preorders = await db.posPreorder.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: 200,
      include: {
        customer: { select: { name: true } },
        location: { select: { name: true } },
      },
    });

    return NextResponse.json(preorders);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/preorders — create a preorder                             */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { staff, db, storeId } = await requirePermission("inventory.adjust");

    let body: {
      customer_id?: string;
      location_id?: string;
      pool_id?: string;
      product_name: string;
      product_details?: Record<string, unknown>;
      quantity?: number;
      deposit_cents?: number;
      total_price_cents?: number;
      release_date?: string;
      notes?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.product_name?.trim()) {
      return NextResponse.json({ error: "Product name is required" }, { status: 400 });
    }

    const qty = body.quantity ?? 1;

    // Check allocation pool capacity if linked
    let waitlisted = false;
    if (body.pool_id) {
      const pool = await db.posAllocationPool.findFirst({
        where: { id: body.pool_id },
      });
      if (!pool) {
        return NextResponse.json({ error: "Allocation pool not found" }, { status: 404 });
      }
      if (pool.status !== "open") {
        return NextResponse.json({ error: "This allocation is closed for new preorders" }, { status: 400 });
      }
      if (pool.total_reserved + qty > pool.total_allocated) {
        // Over capacity — add to waitlist instead of blocking
        waitlisted = true;
      }
    }

    const preorder = await db.posPreorder.create({
      data: {
        store_id: storeId,
        customer_id: body.customer_id ?? null,
        location_id: body.location_id ?? null,
        pool_id: body.pool_id ?? null,
        staff_id: staff.id,
        status: waitlisted ? "pending" : "confirmed",
        waitlisted,
        product_name: body.product_name.trim(),
        product_details: body.product_details ? JSON.parse(JSON.stringify(body.product_details)) : {},
        quantity: qty,
        deposit_cents: body.deposit_cents ?? 0,
        total_price_cents: body.total_price_cents ?? 0,
        release_date: body.release_date ? new Date(body.release_date) : null,
        notes: body.notes ?? null,
      },
    });

    // Update pool reservation count
    if (body.pool_id && !waitlisted) {
      await db.posAllocationPool.update({
        where: { id: body.pool_id },
        data: { total_reserved: { increment: qty } },
      });
    }

    // If there's a deposit, create a ledger entry
    if (body.deposit_cents && body.deposit_cents > 0 && body.customer_id) {
      await db.posLedgerEntry.create({
        data: {
          store_id: storeId,
          type: "sale",
          customer_id: body.customer_id,
          staff_id: staff.id,
          amount_cents: body.deposit_cents,
          description: `Preorder deposit: ${body.product_name}`,
          metadata: JSON.parse(JSON.stringify({
            preorder_id: preorder.id,
            is_deposit: true,
          })),
        },
      });
    }

    return NextResponse.json(preorder, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH /api/preorders — update preorder status                       */
/* ------------------------------------------------------------------ */
export async function PATCH(request: NextRequest) {
  try {
    const { db } = await requirePermission("inventory.adjust");

    let body: {
      id: string;
      status?: string;
      notes?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existing = await db.posPreorder.findFirst({ where: { id: body.id } });
    if (!existing) {
      return NextResponse.json({ error: "Preorder not found" }, { status: 404 });
    }

    const updated = await db.posPreorder.update({
      where: { id: body.id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.status === "fulfilled" ? { fulfilled_at: new Date() } : {}),
        updated_at: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleAuthError(error);
  }
}
