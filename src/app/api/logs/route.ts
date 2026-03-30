import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, requirePermission, handleAuthError } from "@/lib/require-staff";
import { opLog, type EventType, type Severity } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  POST /api/logs — write a log entry (any authenticated staff)       */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { staff, storeId } = await requireStaff();

    let body: {
      eventType: string;
      severity?: string;
      message: string;
      metadata?: Record<string, unknown>;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.eventType || !body.message) {
      return NextResponse.json(
        { error: "eventType and message are required" },
        { status: 400 }
      );
    }

    // Fire-and-forget — opLog never throws
    opLog({
      storeId,
      eventType: body.eventType as EventType,
      severity: (body.severity as Severity) ?? "info",
      message: body.message,
      metadata: body.metadata,
      userId: staff.user_id,
      staffName: staff.name,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/logs — query logs with filters (owner only)               */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requirePermission("store.settings");

    const { searchParams } = new URL(request.url);
    const eventType = searchParams.get("event_type");
    const severity = searchParams.get("severity");
    const since = searchParams.get("since");
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
    const q = searchParams.get("q");
    const before = searchParams.get("before"); // cursor for pagination

    // Default: last 24 hours
    const sinceDate = since
      ? new Date(since)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const where: Record<string, unknown> = {
      store_id: storeId,
      created_at: before
        ? { gte: sinceDate, lt: new Date(before) }
        : { gte: sinceDate },
    };

    if (eventType) where.event_type = eventType;
    if (severity) where.severity = severity;
    if (q) where.message = { contains: q, mode: "insensitive" };

    const logs = await prisma.posOperationalLog.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
    });

    return NextResponse.json(logs);
  } catch (error) {
    return handleAuthError(error);
  }
}
