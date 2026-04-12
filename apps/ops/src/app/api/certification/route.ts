import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { runAllChecks } from "@/lib/certification/checks";

/* ------------------------------------------------------------------ */
/*  GET /api/certification — list past certification runs               */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { db, storeId } = await requirePermission("store.settings");

    const certs = await db.posCertification.findMany({
      where: { store_id: storeId },
      orderBy: { created_at: "desc" },
      take: 20,
    });

    return NextResponse.json(certs);
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/certification — start a new certification run             */
/* ------------------------------------------------------------------ */
export async function POST() {
  try {
    const { staff, db, storeId } = await requirePermission("store.settings");

    // Create certification record
    const cert = await db.posCertification.create({
      data: {
        store_id: storeId,
        staff_id: staff.id,
        status: "running",
        checks: [],
      },
    });

    // Run all checks
    const checks = await runAllChecks(storeId);

    const passCount = checks.filter((c) => c.status === "pass").length;
    const failCount = checks.filter((c) => c.status === "fail").length;
    const warnCount = checks.filter((c) => c.status === "warn").length;

    const overallStatus = failCount > 0 ? "failed" : warnCount > 0 ? "partial" : "passed";

    // Update with results
    const updated = await db.posCertification.update({
      where: { id: cert.id },
      data: {
        checks: JSON.parse(JSON.stringify(checks)),
        status: overallStatus,
        summary: JSON.parse(JSON.stringify({ total: checks.length, passed: passCount, failed: failCount, warnings: warnCount })),
        completed_at: new Date(),
      },
    });

    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
