import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  POST /api/drawer/no-sale — open cash drawer without a transaction  */
/*  Creates a ledger entry for audit trail.                            */
/* ------------------------------------------------------------------ */
export async function POST() {
  try {
    const { staff, storeId } = await requirePermission("checkout");

    const entry = await prisma.posLedgerEntry.create({
      data: {
        store_id: storeId,
        type: "no_sale",
        staff_id: staff.id,
        amount_cents: 0,
        description: `No sale — drawer opened by ${staff.name}`,
        metadata: {
          action: "no_sale",
          staff_name: staff.name,
        },
      },
    });

    // TODO: trigger physical cash drawer kick via hardware integration

    return NextResponse.json({
      success: true,
      ledger_entry_id: entry.id,
      timestamp: entry.created_at,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
