import { NextRequest, NextResponse } from "next/server";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/locations — list locations for store                       */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { db } = await requireStaff();

    const locations = await db.posLocation.findMany({
      orderBy: [{ is_default: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(locations);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/locations — create a new location (owner only)            */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { db, storeId } = await requirePermission("store.settings");

    let body: {
      name: string;
      code?: string;
      type?: string;
      address?: Record<string, unknown>;
      phone?: string;
      is_default?: boolean;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const location = await db.posLocation.create({
      data: {
        store_id: storeId,
        name: body.name.trim(),
        code: body.code?.trim() || null,
        type: body.type ?? "store",
        address: body.address ? JSON.parse(JSON.stringify(body.address)) : null,
        phone: body.phone?.trim() || null,
        is_default: body.is_default ?? false,
      },
    });

    return NextResponse.json(location, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
