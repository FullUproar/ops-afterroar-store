import { NextRequest, NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";

/* ------------------------------------------------------------------ */
/*  GET /api/shipping/labels/[id] — download label PDF                  */
/* ------------------------------------------------------------------ */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requirePermissionAndFeature("manage_orders", "ecommerce");
    const { id } = await params;

    const label = await db.posShippingLabel.findFirst({
      where: { id },
      select: { label_data: true, tracking_number: true, label_format: true },
    });

    if (!label || !label.label_data) {
      return NextResponse.json({ error: "Label not found" }, { status: 404 });
    }

    const buffer = Buffer.from(label.label_data, "base64");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="label-${label.tracking_number || id}.pdf"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
