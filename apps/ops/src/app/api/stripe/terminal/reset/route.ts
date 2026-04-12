import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import { opLog } from "@/lib/op-log";

/**
 * POST /api/stripe/terminal/reset
 * Cancel any pending action on the terminal reader.
 * Use when: tablet crashed, payment stuck, reader won't stop waiting.
 */
export async function POST() {
  try {
    const { storeId, staff } = await requireStaff();

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
    }

    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });
    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const readerId = settings.stripe_terminal_reader_id as string | undefined;

    if (!readerId) {
      return NextResponse.json({ error: "No reader registered" }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    await stripe.terminal.readers.cancelAction(readerId);

    opLog({
      storeId,
      eventType: "terminal.reset",
      message: `Reader action cancelled · ${staff.name}`,
      metadata: { reader_id: readerId },
      staffName: staff.name,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      // "No action to cancel" is fine — reader wasn't doing anything
      if (error.message?.includes("No action")) {
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
    }
    return handleAuthError(error);
  }
}
