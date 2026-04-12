import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import { opLog } from "@/lib/op-log";

/**
 * POST /api/stripe/terminal/collect
 *
 * Creates a PaymentIntent and sends it to the terminal reader.
 * The reader will display "Tap, insert, or swipe" to the customer.
 *
 * Returns the payment_intent_id for polling status.
 */
export async function POST(request: Request) {
  try {
    const { storeId } = await requireStaff();

    const { amount_cents, description, enable_tipping } = await request.json();

    if (!amount_cents || amount_cents < 50) {
      return NextResponse.json({ error: "Amount must be at least $0.50" }, { status: 400 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Get reader ID from store settings
    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });
    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const readerId = settings.stripe_terminal_reader_id as string | undefined;

    if (!readerId) {
      return NextResponse.json({ error: "No terminal reader registered. Go to Settings to register one." }, { status: 400 });
    }

    // 1. Create PaymentIntent for in-person card_present
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: "usd",
      payment_method_types: ["card_present"],
      capture_method: "automatic",
      description: description || "Store Ops sale",
      metadata: {
        store_id: storeId,
        source: "terminal",
        ...(enable_tipping ? { tipping_enabled: "true" } : {}),
      },
    });

    // 2. Send to the reader
    // When tipping is enabled, the S710 shows a tip selection screen
    // before the "Tap, insert, or swipe" prompt
    try {
      await stripe.terminal.readers.processPaymentIntent(
        readerId,
        {
          payment_intent: paymentIntent.id,
          ...(enable_tipping ? {
            process_config: {
              tipping: { amount_eligible: amount_cents },
            },
          } : {}),
        }
      );
    } catch (readerError) {
      // Cancel the payment intent if reader fails
      await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => {});

      if (readerError instanceof Stripe.errors.StripeError) {
        return NextResponse.json({
          error: `Reader error: ${readerError.message}. Is the reader powered on and connected to WiFi?`,
        }, { status: 400 });
      }
      throw readerError;
    }

    // Log terminal connection
    opLog({
      storeId,
      eventType: "terminal.connected",
      message: `Terminal payment initiated · ${(amount_cents / 100).toFixed(2)} · Reader ${readerId}`,
      metadata: { payment_intent_id: paymentIntent.id, amount_cents, reader_id: readerId },
    });

    return NextResponse.json({
      payment_intent_id: paymentIntent.id,
      status: "waiting_for_reader",
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
    }
    return handleAuthError(error);
  }
}

/**
 * GET /api/stripe/terminal/collect?payment_intent_id=pi_xxx
 *
 * Poll the status of a terminal payment.
 * Returns: waiting | succeeded | failed | cancelled
 */
export async function GET(request: Request) {
  try {
    const { storeId, staff } = await requireStaff();

    const url = new URL(request.url);
    const piId = url.searchParams.get("payment_intent_id");

    if (!piId) {
      return NextResponse.json({ error: "payment_intent_id required" }, { status: 400 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const pi = await stripe.paymentIntents.retrieve(piId);

    let status: "waiting" | "succeeded" | "failed" | "cancelled";
    if (pi.status === "succeeded") {
      status = "succeeded";
    } else if (pi.status === "canceled") {
      status = "cancelled";
    } else if (pi.status === "requires_payment_method" && pi.last_payment_error) {
      status = "failed";
    } else {
      status = "waiting";
    }

    // Log terminal payment outcomes (fire-and-forget)
    if (status === "succeeded") {
      opLog({
        storeId,
        eventType: "payment.success",
        message: `Card payment succeeded · $${((pi.amount ?? 0) / 100).toFixed(2)}`,
        metadata: { payment_intent_id: pi.id, amount_cents: pi.amount },
        staffName: staff.name,
      });
    } else if (status === "failed") {
      opLog({
        storeId,
        eventType: "payment.failed",
        severity: "warn",
        message: `Card declined · $${((pi.amount ?? 0) / 100).toFixed(2)}`,
        metadata: { payment_intent_id: pi.id, amount_cents: pi.amount, error: pi.last_payment_error?.message },
        staffName: staff.name,
      });
    }

    // Extract card details from the charge
    let cardBrand: string | null = null;
    let cardLast4: string | null = null;
    if (status === "succeeded" && pi.latest_charge) {
      try {
        const charge = await stripe.charges.retrieve(pi.latest_charge as string);
        cardBrand = charge.payment_method_details?.card_present?.brand ?? charge.payment_method_details?.card?.brand ?? null;
        cardLast4 = charge.payment_method_details?.card_present?.last4 ?? charge.payment_method_details?.card?.last4 ?? null;
      } catch {
        // Non-critical — continue without card details
      }
    }

    // Extract tip amount (Stripe stores it in amount_details.tip when tipping is used)
    const tipAmount = (pi as unknown as { amount_details?: { tip?: { amount?: number } } })
      .amount_details?.tip?.amount ?? 0;

    return NextResponse.json({
      status,
      payment_intent_id: pi.id,
      amount_cents: pi.amount,
      tip_cents: tipAmount,
      error: pi.last_payment_error?.message || null,
      card_brand: cardBrand,
      card_last4: cardLast4,
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
    }
    return handleAuthError(error);
  }
}

/**
 * DELETE /api/stripe/terminal/collect?payment_intent_id=pi_xxx
 *
 * Cancel a pending terminal payment (customer walked away, etc.)
 */
export async function DELETE(request: Request) {
  try {
    await requireStaff();

    const url = new URL(request.url);
    const piId = url.searchParams.get("payment_intent_id");

    if (!piId) {
      return NextResponse.json({ error: "payment_intent_id required" }, { status: 400 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Cancel the reader action
    const store = await prisma.posStore.findFirst({ select: { settings: true } });
    const readerId = (store?.settings as Record<string, unknown>)?.stripe_terminal_reader_id as string | undefined;
    if (readerId) {
      await stripe.terminal.readers.cancelAction(readerId).catch(() => {});
    }

    // Cancel the payment intent
    await stripe.paymentIntents.cancel(piId);

    return NextResponse.json({ status: "cancelled" });
  } catch (error) {
    return handleAuthError(error);
  }
}
