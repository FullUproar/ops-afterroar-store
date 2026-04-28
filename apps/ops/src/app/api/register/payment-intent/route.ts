/**
 * POST /api/register/payment-intent
 *
 * Register-side card sale. The register sends amount + a client-tx-id.
 * In test mode, the server auto-confirms with `pm_card_visa` and returns
 * the resulting PaymentIntent — the register fires its `card_sale` event
 * with the PI id once status='succeeded'.
 *
 * In live mode, the server creates the PI and returns `client_secret` so
 * the register's Elements UI can confirm with real card data. (The
 * Elements UI ships in a follow-up; this endpoint is forward-compatible.)
 *
 * Auth: API key with `register:write` scope.
 */

import { NextResponse } from "next/server";
import { withApiKey } from "@/lib/api-middleware";
import { getStripe, isStripeTestMode } from "@/lib/stripe";
import { resolveRegisterStoreId } from "@/lib/register-auth";

export const POST = withApiKey<Record<string, never>>(async (req, { apiKey }) => {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured on this Store Ops deployment." },
      { status: 503 },
    );
  }

  const storeId = await resolveRegisterStoreId(apiKey);
  if (!storeId) {
    return NextResponse.json({ error: "API key has no associated store" }, { status: 403 });
  }

  let body: { amountCents?: number; clientTxId?: string; customerId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { amountCents, clientTxId } = body;
  if (!amountCents || amountCents <= 0) {
    return NextResponse.json({ error: "amountCents must be > 0" }, { status: 400 });
  }
  if (amountCents < 50) {
    // Stripe minimum for USD
    return NextResponse.json({ error: "Amount must be at least $0.50" }, { status: 400 });
  }
  if (!clientTxId || typeof clientTxId !== "string") {
    return NextResponse.json({ error: "clientTxId is required for idempotency" }, { status: 400 });
  }

  const isTest = isStripeTestMode();

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        ...(isTest
          ? {
              payment_method: "pm_card_visa",
              confirm: true,
              automatic_payment_methods: { enabled: true, allow_redirects: "never" },
            }
          : {
              automatic_payment_methods: { enabled: true, allow_redirects: "never" },
            }),
        metadata: {
          afterroar_store_id: storeId,
          source: "register",
          client_tx_id: clientTxId,
          ...(body.customerId ? { afterroar_customer_id: body.customerId } : {}),
          ...(isTest ? { test_mode: "true" } : {}),
        },
      },
      { idempotencyKey: `register:${clientTxId}` },
    );

    return NextResponse.json({
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      clientSecret: paymentIntent.client_secret,
      testMode: isTest,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}, "register:write");
