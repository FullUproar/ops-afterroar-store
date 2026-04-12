import { NextRequest, NextResponse } from "next/server";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/promotions — list promotions (active ones for checkout,    */
/*  all for management)                                                 */
/*  Query: ?active_only=true for checkout use                           */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("active_only") === "true";

    const now = new Date();
    const where: Record<string, unknown> = {};

    if (activeOnly) {
      where.active = true;
      where.OR = [
        { starts_at: null },
        { starts_at: { lte: now } },
      ];
      // Also filter out expired
      // (Prisma doesn't support OR on ends_at nicely, so we'll filter in JS)
    }

    const promotions = await db.posPromotion.findMany({
      where,
      orderBy: [{ priority: "desc" }, { created_at: "desc" }],
      take: 200,
    });

    // Filter expired if active_only
    const filtered = activeOnly
      ? promotions.filter((p) => !p.ends_at || new Date(p.ends_at) >= now)
      : promotions;

    return NextResponse.json(filtered);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/promotions — create a promotion (manager+)                */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermission("inventory.adjust");

    let body: {
      name: string;
      type: "percent_off" | "amount_off" | "fixed_price";
      value: number;
      scope: string;
      scope_value?: string;
      starts_at?: string;
      ends_at?: string;
      priority?: number;
      metadata?: Record<string, unknown>;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.name || !body.type || body.value === undefined || !body.scope) {
      return NextResponse.json(
        { error: "name, type, value, and scope are required" },
        { status: 400 }
      );
    }

    const promo = await db.posPromotion.create({
      data: {
        store_id: storeId,
        name: body.name,
        type: body.type,
        value: body.value,
        scope: body.scope,
        scope_value: body.scope_value ?? null,
        starts_at: body.starts_at ? new Date(body.starts_at) : null,
        ends_at: body.ends_at ? new Date(body.ends_at) : null,
        priority: body.priority ?? 0,
        active: true,
        metadata: body.metadata ? JSON.parse(JSON.stringify(body.metadata)) : {},
      },
    });

    return NextResponse.json(promo, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH /api/promotions — update a promotion (toggle active, etc.)    */
/* ------------------------------------------------------------------ */
export async function PATCH(request: NextRequest) {
  try {
    const { db } = await requirePermission("inventory.adjust");

    let body: { id: string; active?: boolean; ends_at?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existing = await db.posPromotion.findFirst({ where: { id: body.id } });
    if (!existing) {
      return NextResponse.json({ error: "Promotion not found" }, { status: 404 });
    }

    const updated = await db.posPromotion.update({
      where: { id: body.id },
      data: {
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.ends_at ? { ends_at: new Date(body.ends_at) } : {}),
        updated_at: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleAuthError(error);
  }
}
