import { NextRequest, NextResponse } from "next/server";
import { drainOutbox } from "@/lib/hq-outbox";

/* ------------------------------------------------------------------ */
/*  POST /api/hq-bridge/drain — drain the HQ outbox                   */
/*  Called by Vercel Cron every 30 seconds, or manually.               */
/*  Protected by a simple bearer token (CRON_SECRET env var).          */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  // Verify cron secret (if set)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await drainOutbox();

  return NextResponse.json({
    ...result,
    drained_at: new Date().toISOString(),
  });
}

// Also allow GET for Vercel Cron (cron jobs send GET requests)
export async function GET(request: NextRequest) {
  return POST(request);
}
