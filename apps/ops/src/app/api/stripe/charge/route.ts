import { NextRequest, NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import { getStripe, isStripeTestMode } from "@/lib/stripe";

/* ------------------------------------------------------------------ */
/*  POST /api/stripe/charge — create and confirm a PaymentIntent        */
/*                                                                      */
/*  For POS without a physical terminal: auto-confirms the payment.     */
/*  In test mode, uses pm_card_visa (always succeeds).                  */
/*  In live mode, this would be replaced by Stripe Terminal SDK.        */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const { storeId } = await requireStaff();

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe is not configured. Set STRIPE_SECRET_KEY." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { amount_cents, metadata } = body as {
      amount_cents: number;
      metadata?: Record<string, string>;
    };

    if (!amount_cents || amount_cents <= 0) {
      return NextResponse.json(
        { error: "Invalid amount" },
        { status: 400 }
      );
    }

    // Minimum Stripe charge is 50 cents
    if (amount_cents < 50) {
      return NextResponse.json(
        { error: "Amount must be at least $0.50" },
        { status: 400 }
      );
    }

    const isTest = isStripeTestMode();

    // Create and auto-confirm a PaymentIntent
    // In test mode: use pm_card_visa (always succeeds)
    // In live mode: this endpoint won't be used — Stripe Terminal handles it
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: "usd",
      ...(isTest
        ? {
            payment_method: "pm_card_visa",
            confirm: true,
            automatic_payment_methods: {
              enabled: true,
              allow_redirects: "never",
            },
          }
        : {
            automatic_payment_methods: {
              enabled: true,
              allow_redirects: "never",
            },
          }),
      metadata: {
        ...(metadata || {}),
        afterroar_store_id: storeId,
        source: "afterroar_store_ops",
        ...(isTest ? { test_mode: "true" } : {}),
      },
    });

    return NextResponse.json({
      payment_intent_id: paymentIntent.id,
      status: paymentIntent.status,
      client_secret: paymentIntent.client_secret,
      test_mode: isTest,
    });
  } catch (error) {
    // Handle Stripe-specific errors
    if (error && typeof error === "object" && "type" in error) {
      const stripeError = error as { type: string; message: string };
      console.error("[Stripe Charge] Stripe error:", stripeError.message);
      return NextResponse.json(
        { error: stripeError.message },
        { status: 400 }
      );
    }
    return handleAuthError(error);
  }
}
