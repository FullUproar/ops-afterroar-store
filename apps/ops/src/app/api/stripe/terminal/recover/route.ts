import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { verifyPaymentIntent } from "@/lib/stripe-terminal-recovery";
import { opLog } from "@/lib/op-log";

/* ------------------------------------------------------------------ */
/*  POST /api/stripe/terminal/recover                                  */
/*                                                                     */
/*  Used by the register UI when the terminal disconnects mid-payment  */
/*  or the network drops between confirm and webhook. The client       */
/*  posts the saved paymentIntentId; we ask Stripe what actually       */
/*  happened, log the verification attempt, and return the canonical   */
/*  status.                                                            */
/*                                                                     */
/*  We never auto-charge or auto-cancel here — recovery is a read.     */
/*  The UI decides whether to finalize the sale, re-collect, or show   */
/*  failure based on the returned status.                              */
/* ------------------------------------------------------------------ */

export async function POST(request: Request) {
  try {
    const { storeId, staff } = await requireStaff();

    let body: { paymentIntentId?: string; client_tx_id?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const piId = body.paymentIntentId;
    if (!piId) {
      return NextResponse.json(
        { error: "paymentIntentId required" },
        { status: 400 },
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 400 },
      );
    }

    // Fire-and-forget: log that we're verifying. Includes both the PI ID
    // and (if provided) the client_tx_id so we can reconstruct the full
    // history of a disputed charge across server logs.
    opLog({
      storeId,
      eventType: "terminal.verify",
      message: `Terminal verify: looking up payment intent ${piId}`,
      metadata: {
        payment_intent_id: piId,
        client_tx_id: body.client_tx_id ?? null,
      },
      staffName: staff.name,
      userId: staff.user_id,
    });

    const result = await verifyPaymentIntent(piId);

    // Log the result so we have a paper trail of "what did Stripe say
    // when the cashier reconnected after the reader dropped?"
    opLog({
      storeId,
      eventType: "terminal.verify",
      severity: result.status === "succeeded" ? "info" : "warn",
      message: `Terminal verify: ${piId} → ${result.status}`,
      metadata: {
        payment_intent_id: piId,
        client_tx_id: body.client_tx_id ?? null,
        status: result.status,
        raw_status: result.raw_status,
        amount_cents: result.amount_cents,
        last_error: result.last_error,
      },
      staffName: staff.name,
      userId: staff.user_id,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 400 },
      );
    }
    return handleAuthError(error);
  }
}
