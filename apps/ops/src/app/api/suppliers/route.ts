import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

export async function GET() {
  try {
    const { db } = await requireStaff();

    const data = await db.posSupplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, contact: true, default_lead_time_days: true },
    });

    return NextResponse.json(data);
  } catch (error) {
    return handleAuthError(error);
  }
}
