import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";

/* ------------------------------------------------------------------ */
/*  POST /api/stripe/webhook — receive Stripe events                    */
/*                                                                      */
/*  Handles:                                                            */
/*  - payment_intent.succeeded     — payment confirmed                  */
/*  - payment_intent.payment_failed — payment failed                    */
/*  - charge.refunded              — refund processed                   */
/*  - account.updated              — Connect account status change      */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const body = await request.text();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  if (webhookSecret) {
    // Production mode: verify webhook signature
    const sig = request.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      console.error("[Stripe Webhook] Signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } else if (process.env.NODE_ENV === "development") {
    // Development mode only: parse without verification (log warning)
    console.warn("[Stripe Webhook] No STRIPE_WEBHOOK_SECRET set — processing without signature verification (dev only)");
    try {
      event = JSON.parse(body) as Stripe.Event;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  } else {
    // Production: reject webhooks without signature verification
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured — rejecting webhook in production");
    return NextResponse.json(
      { error: "Webhook signature verification not configured" },
      { status: 500 },
    );
  }

  // Handle events
  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;

      default:
        // Unhandled event type — log but don't error
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Event Handlers                                                      */
/* ------------------------------------------------------------------ */

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const storeId = paymentIntent.metadata?.afterroar_store_id;
  if (!storeId) return; // Not from Store Ops

  // Find the ledger entry by payment intent ID in metadata
  const ledgerEntry = await prisma.posLedgerEntry.findFirst({
    where: {
      store_id: storeId,
      type: "sale",
      metadata: {
        path: ["transaction_id"],
        equals: paymentIntent.id,
      },
    },
  });

  if (ledgerEntry) {
    // Payment confirmed — update metadata
    await prisma.posLedgerEntry.update({
      where: { id: ledgerEntry.id },
      data: {
        metadata: {
          ...(ledgerEntry.metadata as Record<string, unknown>),
          stripe_status: "succeeded",
          stripe_confirmed_at: new Date().toISOString(),
        },
      },
    });
  }

  console.log(`[Stripe] Payment succeeded: ${paymentIntent.id} for store ${storeId}`);
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const storeId = paymentIntent.metadata?.afterroar_store_id;
  if (!storeId) return;

  const ledgerEntry = await prisma.posLedgerEntry.findFirst({
    where: {
      store_id: storeId,
      type: "sale",
      metadata: {
        path: ["transaction_id"],
        equals: paymentIntent.id,
      },
    },
  });

  if (ledgerEntry) {
    await prisma.posLedgerEntry.update({
      where: { id: ledgerEntry.id },
      data: {
        metadata: {
          ...(ledgerEntry.metadata as Record<string, unknown>),
          stripe_status: "failed",
          stripe_failure_reason: paymentIntent.last_payment_error?.message ?? "Unknown",
          stripe_failed_at: new Date().toISOString(),
        },
      },
    });
  }

  console.log(`[Stripe] Payment failed: ${paymentIntent.id} for store ${storeId}`);
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  // Log the refund — the actual refund ledger entry is created by our returns API
  console.log(`[Stripe] Charge refunded: ${charge.id}, amount: ${charge.amount_refunded}`);
}

async function handleAccountUpdated(account: Stripe.Account) {
  const storeId = account.metadata?.afterroar_store_id;
  if (!storeId) return;

  // Update store settings with latest account status
  const store = await prisma.posStore.findUnique({
    where: { id: storeId },
    select: { settings: true },
  });

  if (store) {
    const settings = (store.settings ?? {}) as Record<string, unknown>;
    await prisma.posStore.update({
      where: { id: storeId },
      data: {
        settings: {
          ...settings,
          stripe_charges_enabled: account.charges_enabled,
          stripe_payouts_enabled: account.payouts_enabled,
          stripe_details_submitted: account.details_submitted,
        },
        updated_at: new Date(),
      },
    });
  }

  console.log(`[Stripe] Account updated: ${account.id} for store ${storeId}`);
}
