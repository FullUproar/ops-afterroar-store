import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import Stripe from "stripe";

/**
 * POST /api/stripe/terminal/payment
 * Create a PaymentIntent for the Terminal reader to collect.
 */
export async function POST(request: Request) {
  try {
    const { storeId } = await requireStaff();

    const { amount_cents, description, enable_tipping, tip_presets } = await request.json();

    if (!amount_cents || amount_cents < 50) {
      return NextResponse.json(
        { error: "Amount must be at least $0.50" },
        { status: 400 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 400 }
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Create a PaymentIntent for terminal collection
    // Tipping: when enabled, the S710 reader shows a tip prompt on-screen
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

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 400 }
      );
    }
    return handleAuthError(error);
  }
}

/**
 * PATCH /api/stripe/terminal/payment
 * Process the payment on a specific reader.
 */
export async function PATCH(request: Request) {
  try {
    await requireStaff();

    const { reader_id, payment_intent_id, enable_tipping } = await request.json();

    if (!reader_id || !payment_intent_id) {
      return NextResponse.json(
        { error: "reader_id and payment_intent_id required" },
        { status: 400 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 400 }
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Tell the reader to collect payment
    // When tipping enabled, S710 shows tip selection screen before card tap
    const processConfig: Stripe.Terminal.ReaderProcessPaymentIntentParams = {
      payment_intent: payment_intent_id,
    };

    if (enable_tipping) {
      processConfig.process_config = {
        tipping: { amount_eligible: undefined }, // Stripe calculates from PI amount
      };
    }

    const reader = await stripe.terminal.readers.processPaymentIntent(
      reader_id,
      processConfig,
    );

    return NextResponse.json({
      success: true,
      reader_status: reader.status,
      action: reader.action,
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 400 }
      );
    }
    return handleAuthError(error);
  }
}
