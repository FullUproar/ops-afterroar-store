import { NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  GET /api/push/vapid-key — return public VAPID key for push subs     */
/*  Public endpoint (needed by client before auth for subscription).   */
/* ------------------------------------------------------------------ */

export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;

  if (!key) {
    return NextResponse.json(
      { error: "Push notifications not configured" },
      { status: 503 },
    );
  }

  return NextResponse.json({ key });
}
