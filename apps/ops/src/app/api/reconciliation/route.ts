/**
 * GET /api/reconciliation
 *
 * Lists register events that need owner attention — conflicts (oversold,
 * negative balances, etc.) and rejections (events the server couldn't apply).
 *
 * Auth: requires staff session, scoped to the staff's store.
 *
 * Future: POST /api/reconciliation/resolve — mark a conflict reviewed
 * with an operator decision. Read-only for the demo phase.
 */

import { NextResponse } from "next/server";
import { requireStaff, AuthError, NoStoreError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";

export async function GET() {
  let ctx;
  try {
    ctx = await requireStaff();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof NoStoreError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const events = await prisma.registerEvent.findMany({
    where: {
      storeId: ctx.storeId,
      status: { in: ["conflict", "rejected"] },
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      deviceId: e.deviceId,
      type: e.type,
      wallTime: e.wallTime.toISOString(),
      receivedAt: e.receivedAt.toISOString(),
      status: e.status,
      conflictData: e.conflictData,
      payload: e.payload,
    })),
  });
}
