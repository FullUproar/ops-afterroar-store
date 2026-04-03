import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/customers — list / search customers                      */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const { db } = await requireStaff();

    const q = request.nextUrl.searchParams.get("q")?.trim();

    // Build search — match on name, email, phone, or afterroar_user_id
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } },
            { afterroar_user_id: q },
          ],
        }
      : {};

    const data = await db.posCustomer.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        credit_balance_cents: true,
        loyalty_points: true,
        afterroar_user_id: true,
        created_at: true,
      },
      orderBy: { name: "asc" },
      take: 50,
    });

    return NextResponse.json(data);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/customers — create a new customer                       */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requireStaff();

    let body: { name: string; email?: string | null; phone?: string | null };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const data = await db.posCustomer.create({
      data: {
        store_id: storeId,
        name: body.name.trim(),
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        credit_balance_cents: 0,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        credit_balance_cents: true,
        created_at: true,
      },
    });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
