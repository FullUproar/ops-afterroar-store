import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health — system health check.
 *
 * Public endpoint. Returns 200 healthy, 503 unhealthy. Used by Sentry
 * Uptime Monitor + the /admin/health dashboard + any synthetic bot.
 *
 * Cheap query against User to verify DB connectivity. No auth — health
 * is by definition the only thing you can probe when you're locked out.
 */
export async function GET() {
  const start = Date.now();
  const checks: Record<string, { ok: boolean; ms: number; error?: string }> = {};

  try {
    const dbStart = Date.now();
    await prisma.$executeRaw`SELECT 1`;
    checks.database = { ok: true, ms: Date.now() - dbStart };
  } catch (err) {
    checks.database = {
      ok: false,
      ms: Date.now() - start,
      error: err instanceof Error ? err.message.slice(0, 200) : "Unknown",
    };
  }

  const allOk = checks.database.ok;

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      response_ms: Date.now() - start,
      checks,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev",
    },
    {
      status: allOk ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
