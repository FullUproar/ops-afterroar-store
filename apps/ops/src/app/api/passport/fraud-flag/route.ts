import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { enqueueHQ } from "@/lib/hq-outbox";
import { opLog } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  POST /api/passport/fraud-flag                                      */
/*  Report a fraud flag to HQ for a linked Afterroar customer.         */
/*                                                                     */
/*  Auth: requirePermission("customers.edit")                          */
/*  Body: { customer_id, severity, reason }                            */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { db, storeId, staff } = await requirePermission("customers.edit");

    let body: { customer_id: string; severity: "low" | "medium" | "high"; reason: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { customer_id, severity, reason } = body;

    if (!customer_id || !severity || !reason) {
      return NextResponse.json(
        { error: "customer_id, severity, and reason are required" },
        { status: 400 },
      );
    }

    if (!["low", "medium", "high"].includes(severity)) {
      return NextResponse.json(
        { error: "severity must be low, medium, or high" },
        { status: 400 },
      );
    }

    // Look up customer
    const customer = await db.posCustomer.findFirst({
      where: { id: customer_id },
      select: { id: true, name: true, afterroar_user_id: true },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    if (!customer.afterroar_user_id) {
      return NextResponse.json(
        { error: "Cannot flag a customer who is not linked to an Afterroar account" },
        { status: 400 },
      );
    }

    // Enqueue fraud flag to HQ
    await enqueueHQ(storeId, "fraud_flag", {
      userId: customer.afterroar_user_id,
      storeId,
      severity,
      reason,
      reportedBy: staff.name,
    });

    // Log to ops log
    opLog({
      storeId,
      eventType: "passport.fraud_flag",
      severity: severity === "high" ? "critical" : severity === "medium" ? "warn" : "info",
      message: `Fraud flag (${severity}) reported for "${customer.name}": ${reason}`,
      metadata: {
        customer_id,
        afterroar_user_id: customer.afterroar_user_id,
        severity,
        reason,
        reported_by: staff.name,
      },
      staffName: staff.name,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
