import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToStore } from "@/lib/web-push";

/* ------------------------------------------------------------------ */
/*  POST /api/health/synthetic — synthetic transaction bot               */
/*  Runs against a test store, simulates real operations, records        */
/*  response times. Called by Vercel Cron every 5 minutes.              */
/*                                                                     */
/*  What it tests:                                                      */
/*    1. Inventory search (read)                                        */
/*    2. Customer lookup (read)                                         */
/*    3. Health check (infrastructure)                                  */
/*    4. Intelligence generation (complex query)                        */
/*                                                                     */
/*  Results stored in pos_operational_logs for trending.                */
/* ------------------------------------------------------------------ */

interface TestResult {
  test: string;
  ok: boolean;
  ms: number;
  error?: string;
}

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { test: name, ok: true, ms: Date.now() - start };
  } catch (err) {
    return { test: name, ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : "Unknown" };
  }
}

export async function POST(request: NextRequest) {
  // Auth — Vercel Cron or manual trigger
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the test store (SSP Test Store or any store with "test" in the name)
  const testStore = await prisma.posStore.findFirst({
    where: {
      OR: [
        { slug: "ssp-test-store" },
        { name: { contains: "test", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true },
  });

  if (!testStore) {
    return NextResponse.json({ error: "No test store found" }, { status: 404 });
  }

  const results: TestResult[] = [];

  // Test 1: Database read — inventory search
  results.push(
    await runTest("inventory_search", async () => {
      const items = await prisma.posInventoryItem.findMany({
        where: { store_id: testStore.id, active: true },
        take: 10,
      });
      if (!Array.isArray(items)) throw new Error("Invalid response");
    }),
  );

  // Test 2: Database read — customer lookup
  results.push(
    await runTest("customer_lookup", async () => {
      await prisma.posCustomer.findMany({
        where: { store_id: testStore.id },
        take: 5,
      });
    }),
  );

  // Test 3: Database write — create and delete a test ledger entry
  results.push(
    await runTest("ledger_write", async () => {
      const entry = await prisma.posLedgerEntry.create({
        data: {
          store_id: testStore.id,
          type: "adjustment",
          amount_cents: 0,
          description: "Synthetic health check — safe to ignore",
          metadata: { synthetic: true, timestamp: new Date().toISOString() },
        },
      });
      await prisma.posLedgerEntry.delete({ where: { id: entry.id } });
    }),
  );

  // Test 4: Complex query — aggregation (simulates reports)
  results.push(
    await runTest("aggregation", async () => {
      await prisma.posLedgerEntry.aggregate({
        where: { store_id: testStore.id, type: "sale" },
        _sum: { amount_cents: true },
        _count: true,
      });
    }),
  );

  // Test 5: External API — Scryfall ping
  results.push(
    await runTest("scryfall_api", async () => {
      const res = await fetch("https://api.scryfall.com/cards/named?exact=Lightning+Bolt", {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Scryfall returned ${res.status}`);
    }),
  );

  // Calculate summary
  const allPassed = results.every((r) => r.ok);
  const avgMs = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
  const maxMs = Math.max(...results.map((r) => r.ms));

  // Store results in operational log for trending
  try {
    await prisma.posOperationalLog.create({
      data: {
        store_id: testStore.id,
        event_type: "synthetic_health_check",
        severity: allPassed ? "info" : "warn",
        message: `Synthetic: ${results.filter((r) => r.ok).length}/${results.length} passed, avg ${avgMs}ms, max ${maxMs}ms`,
        metadata: JSON.parse(JSON.stringify({
          results,
          summary: { all_passed: allPassed, avg_ms: avgMs, max_ms: maxMs, timestamp: new Date().toISOString() },
        })),
      },
    });
  } catch {
    // Log storage is non-critical
  }

  // Push notifications on failure or recovery
  try {
    const store = await prisma.posStore.findUnique({
      where: { id: testStore.id },
      select: { settings: true },
    });
    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const subs = (settings.push_subscriptions ?? []) as Array<unknown>;

    if (subs.length > 0) {
      // Check previous result for recovery detection
      const prevLog = await prisma.posOperationalLog.findFirst({
        where: {
          store_id: testStore.id,
          event_type: "synthetic_health_check",
          NOT: { created_at: { gte: new Date(Date.now() - 1000) } }, // exclude this run
        },
        orderBy: { created_at: "desc" },
        select: { severity: true },
      });
      const wasFailing = prevLog?.severity === "warn";

      if (!allPassed) {
        // Alert: tests failing
        const failedTests = results.filter((r) => !r.ok).map((r) => r.test).join(", ");
        await sendPushToStore(settings, {
          title: "System Alert",
          body: `Failed: ${failedTests}`,
          tag: "ops-failure",
          url: "/ops",
        });
      } else if (wasFailing && allPassed) {
        // Recovery notification
        await sendPushToStore(settings, {
          title: "All Systems Recovered",
          body: `All ${results.length} checks passing — avg ${avgMs}ms`,
          tag: "ops-recovery",
          url: "/ops",
        });
      }
    }
  } catch {
    // Push notification is non-critical
  }

  return NextResponse.json({
    status: allPassed ? "healthy" : "degraded",
    tests: results,
    summary: {
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      avg_ms: avgMs,
      max_ms: maxMs,
    },
    timestamp: new Date().toISOString(),
  });
}

// GET — retrieve recent synthetic test results for status page
export async function GET() {
  try {
    const results = await prisma.posOperationalLog.findMany({
      where: { event_type: "synthetic_health_check" },
      orderBy: { created_at: "desc" },
      take: 288, // 24 hours at 5-min intervals
      select: {
        created_at: true,
        severity: true,
        message: true,
        metadata: true,
      },
    });

    // Calculate uptime
    const total = results.length;
    const healthy = results.filter((r) => r.severity === "info").length;
    const uptimePercent = total > 0 ? Math.round((healthy / total) * 10000) / 100 : 100;

    // Average response time over last 24h
    const avgMs = total > 0
      ? Math.round(
          results.reduce((sum, r) => {
            const meta = r.metadata as Record<string, unknown> | null;
            const summary = meta?.summary as Record<string, number> | undefined;
            return sum + (summary?.avg_ms || 0);
          }, 0) / total,
        )
      : 0;

    return NextResponse.json({
      uptime_percent: uptimePercent,
      avg_response_ms: avgMs,
      checks_24h: total,
      healthy_24h: healthy,
      last_check: results[0]?.created_at || null,
      recent: results.slice(0, 12), // Last hour
    });
  } catch {
    return NextResponse.json({ uptime_percent: 0, error: "No data" });
  }
}
