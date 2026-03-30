import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireStaff,
  requirePermission,
  handleAuthError,
} from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  Issue Flag System                                                   */
/*  Stores issue flags as ledger entries with type "issue_flag"         */
/*  so no new table is needed.                                         */
/* ------------------------------------------------------------------ */

const VALID_ISSUE_TYPES = [
  "wrong_price",
  "wrong_stock_count",
  "item_missing",
  "scanner_issue",
  "system_error",
  "other",
] as const;

/* ------------------------------------------------------------------ */
/*  POST /api/issues — create an issue flag                            */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { staff, storeId } = await requireStaff();

    let body: {
      type: string;
      description: string;
      related_item_id?: string;
      related_barcode?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.type || !VALID_ISSUE_TYPES.includes(body.type as typeof VALID_ISSUE_TYPES[number])) {
      return NextResponse.json(
        { error: `Invalid issue type. Must be one of: ${VALID_ISSUE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!body.description?.trim()) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      );
    }

    const entry = await prisma.posLedgerEntry.create({
      data: {
        store_id: storeId,
        type: "issue_flag",
        staff_id: staff.id,
        amount_cents: 0,
        description: `Issue: ${body.type} — ${body.description.trim()}`,
        metadata: {
          issue_type: body.type,
          issue_description: body.description.trim(),
          related_item_id: body.related_item_id ?? null,
          related_barcode: body.related_barcode ?? null,
          status: "open",
          staff_name: staff.name,
        },
      },
    });

    return NextResponse.json({
      success: true,
      id: entry.id,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/issues — list open issues for the store (manager+)        */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requirePermission("reports");

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "open";

    const issues = await prisma.posLedgerEntry.findMany({
      where: {
        store_id: storeId,
        type: "issue_flag",
        ...(status !== "all"
          ? { metadata: { path: ["status"], equals: status } }
          : {}),
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });

    return NextResponse.json(issues);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH /api/issues — resolve an issue                               */
/* ------------------------------------------------------------------ */
export async function PATCH(request: NextRequest) {
  try {
    const { staff, storeId } = await requirePermission("reports");

    let body: { id: string; status?: string; resolution_notes?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const entry = await prisma.posLedgerEntry.findFirst({
      where: { id: body.id, store_id: storeId, type: "issue_flag" },
    });

    if (!entry) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    const currentMetadata = (entry.metadata as Record<string, unknown>) ?? {};
    const updated = await prisma.posLedgerEntry.update({
      where: { id: body.id },
      data: {
        metadata: {
          ...currentMetadata,
          status: body.status ?? "resolved",
          resolved_by: staff.name,
          resolved_at: new Date().toISOString(),
          resolution_notes: body.resolution_notes ?? null,
        },
      },
    });

    return NextResponse.json({ success: true, entry: updated });
  } catch (error) {
    return handleAuthError(error);
  }
}
