import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireStaff();

    const body = await request.json();
    const { action } = body;

    // Verify checkout exists and belongs to this store
    const checkout = await db.posGameCheckout.findFirst({
      where: { id },
    });

    if (!checkout) {
      return NextResponse.json(
        { error: "Checkout not found" },
        { status: 404 }
      );
    }

    if (action === "return") {
      if (checkout.status === "returned") {
        return NextResponse.json(
          { error: "Game has already been returned" },
          { status: 400 }
        );
      }

      const updated = await db.posGameCheckout.update({
        where: { id },
        data: {
          status: "returned",
          returned_at: new Date(),
          return_condition: body.condition || null,
          return_notes: body.notes || null,
        },
        include: {
          inventory_item: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
        },
      });

      return NextResponse.json(updated);
    }

    if (action === "mark_overdue") {
      if (checkout.status !== "out") {
        return NextResponse.json(
          { error: "Only active checkouts can be marked overdue" },
          { status: 400 }
        );
      }

      const updated = await db.posGameCheckout.update({
        where: { id },
        data: { status: "overdue" },
        include: {
          inventory_item: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
        },
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return handleAuthError(error);
  }
}
