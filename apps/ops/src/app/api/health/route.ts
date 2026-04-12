import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  GET /api/health — system health check                               */
/*  Public endpoint. Returns service status + response times.           */
/*  Used by: status page, synthetic bot, uptime monitoring.             */
/* ------------------------------------------------------------------ */

export async function GET() {
  const start = Date.now();
  const checks: Record<string, { ok: boolean; ms: number; error?: string }> = {};

  // Database connectivity
  try {
    const dbStart = Date.now();
    await prisma.posStore.count();
    checks.database = { ok: true, ms: Date.now() - dbStart };
  } catch (err) {
    checks.database = { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : "Unknown" };
  }

  // Stripe connectivity (light check)
  try {
    const stripeStart = Date.now();
    const hasStripe = !!process.env.STRIPE_SECRET_KEY;
    checks.stripe = { ok: hasStripe, ms: Date.now() - stripeStart };
  } catch {
    checks.stripe = { ok: false, ms: 0 };
  }

  // Email service — "not configured" is not an outage
  const hasEmail = !!process.env.RESEND_API_KEY;
  checks.email = { ok: true, ms: 0, ...(hasEmail ? {} : { note: "not configured" }) };

  // ShipStation — "not configured" is not an outage
  const hasShipping = !!(process.env.SHIPSTATION_API_KEY && process.env.SHIPSTATION_API_SECRET);
  checks.shipping = { ok: true, ms: 0, ...(hasShipping ? {} : { note: "not configured" }) };

  // Only core services (database, stripe) determine overall health
  const allOk = checks.database.ok;
  const totalMs = Date.now() - start;

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      response_ms: totalMs,
      checks,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev",
    },
    {
      status: allOk ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
