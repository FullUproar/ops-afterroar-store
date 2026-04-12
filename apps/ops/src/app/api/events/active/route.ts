import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/events/active — find currently running event              */
/*  Returns the event that's happening right now (starts_at <= now     */
/*  <= ends_at) for halo revenue tagging at checkout.                  */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const { db } = await requireStaff();
    const now = new Date();

    const event = await db.posEvent.findFirst({
      where: {
        starts_at: { lte: now },
        ends_at: { gte: now },
      },
      select: { id: true, name: true, event_type: true },
      orderBy: { starts_at: "desc" },
    });

    return NextResponse.json({ event: event || null });
  } catch (error) {
    return handleAuthError(error);
  }
}
