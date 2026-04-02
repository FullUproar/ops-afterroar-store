import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  POST /api/receipts/number — generate next receipt number            */
/*  Atomically increments a daily counter on the store.                */
/*  Format: R-YYYYMMDD-NNN (e.g. R-20260402-047)                      */
/* ------------------------------------------------------------------ */

export async function POST() {
  try {
    const { storeId } = await requireStaff();

    const now = new Date();
    const dateStr =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");

    const counterKey = `receipt_counter_${dateStr}`;

    // Atomic increment via raw SQL to avoid race conditions
    const result = await prisma.$queryRawUnsafe<Array<{ settings: Record<string, unknown> }>>(
      `UPDATE pos_stores
       SET settings = jsonb_set(
         COALESCE(settings, '{}'::jsonb),
         $2::text[],
         to_jsonb(COALESCE((settings->>$3)::int, 0) + 1)
       )
       WHERE id = $1
       RETURNING settings`,
      storeId,
      `{${counterKey}}`,
      counterKey,
    );

    const counter = (result[0]?.settings?.[counterKey] as number) || 1;
    const receiptNumber = `R-${dateStr}-${String(counter).padStart(3, "0")}`;

    return NextResponse.json({ receipt_number: receiptNumber });
  } catch (error) {
    return handleAuthError(error);
  }
}
