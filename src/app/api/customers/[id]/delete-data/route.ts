import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { deleteCustomerData } from "@/lib/data-deletion";
import { opLog } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  POST /api/customers/[id]/delete-data                               */
/*  GDPR/CCPA data deletion — anonymizes customer PII                  */
/* ------------------------------------------------------------------ */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { storeId, staff } = await requirePermission("customers.delete");

    // Require explicit confirmation
    let body: { confirm?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (body.confirm !== true) {
      return NextResponse.json(
        {
          error:
            "Confirmation required. Send { confirm: true } to proceed. This action is permanent and irreversible.",
        },
        { status: 400 },
      );
    }

    const report = await deleteCustomerData(storeId, id);

    // Log the deletion to operational log
    opLog({
      storeId,
      eventType: "settings.changed",
      severity: "warn",
      message: `Customer data deleted (GDPR/CCPA): ${id}`,
      metadata: {
        customer_id: id,
        notes_deleted: report.notes_deleted,
        ledger_entries_preserved: report.ledger_entries_preserved,
        orders_preserved: report.orders_preserved,
        hq_notified: report.hq_notified,
      },
      staffName: staff.name,
    });

    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Customer not found") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message === "Customer data has already been deleted") {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
    }
    return handleAuthError(error);
  }
}
