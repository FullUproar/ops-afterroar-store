import Stripe from "stripe";

/* ------------------------------------------------------------------ */
/*  Stripe Terminal Recovery Helpers                                   */
/*                                                                     */
/*  Thin wrappers around stripe.paymentIntents.retrieve() used by the  */
/*  reconnect / recovery flows. The point of this module is one place  */
/*  that turns a raw PaymentIntent into the canonical status enum the  */
/*  UI knows how to render.                                            */
/*                                                                     */
/*  The recovery flow:                                                 */
/*    1. Reader / network drops mid-collect.                           */
/*    2. UI flips into "reconnecting".                                 */
/*    3. Once reconnected, UI flips into "verifying".                  */
/*    4. UI calls /api/stripe/terminal/recover with the saved          */
/*       paymentIntentId — server calls verifyPaymentIntent() and      */
/*       reports back the actual Stripe-side status.                   */
/*    5. UI takes the right action: complete the sale (succeeded),    */
/*       collect again (requires_payment_method), wait some more       */
/*       (processing / requires_action), or surface an explicit        */
/*       failure.                                                      */
/* ------------------------------------------------------------------ */

export type PaymentIntentStatus =
  | "succeeded"
  | "requires_action"
  | "requires_capture"
  | "requires_payment_method"
  | "processing"
  | "canceled";

export interface VerifyResult {
  status: PaymentIntentStatus;
  payment_intent_id: string;
  amount_cents: number | null;
  /** Stripe's raw status string (kept for debugging) */
  raw_status: Stripe.PaymentIntent.Status;
  /** Latest payment error message, if any */
  last_error: string | null;
  /** Tip in cents (S710 collects on-screen) */
  tip_cents: number;
  /** Card brand on the most recent successful charge (for receipts) */
  card_brand: string | null;
  /** Last 4 of the card on the most recent successful charge */
  card_last4: string | null;
}

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(key);
}

/**
 * Look up a PaymentIntent by ID and translate its status into the
 * canonical recovery enum used by the register UI.
 *
 * Throws if Stripe is not configured or the PI ID is invalid — callers
 * are expected to handle the error and surface a "verification failed,
 * try again" UI rather than silently auto-completing.
 */
export async function verifyPaymentIntent(piId: string): Promise<VerifyResult> {
  if (!piId) {
    throw new Error("payment_intent_id required");
  }

  const stripe = getStripeClient();

  // Expand latest_charge so we can pull card details in one round-trip
  const pi = await stripe.paymentIntents.retrieve(piId, {
    expand: ["latest_charge"],
  });

  // Map Stripe's status → our canonical recovery enum.
  // Stripe currently has: requires_payment_method | requires_confirmation |
  // requires_action | processing | requires_capture | canceled | succeeded
  let status: PaymentIntentStatus;
  switch (pi.status) {
    case "succeeded":
      status = "succeeded";
      break;
    case "canceled":
      status = "canceled";
      break;
    case "requires_capture":
      status = "requires_capture";
      break;
    case "requires_action":
      status = "requires_action";
      break;
    case "processing":
      status = "processing";
      break;
    case "requires_payment_method":
    case "requires_confirmation":
    default:
      // requires_confirmation is rare for Terminal flows; collapse with
      // requires_payment_method since both mean "ask the customer to tap"
      status = "requires_payment_method";
      break;
  }

  // Extract card details if a charge has settled
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;
  const charge = pi.latest_charge as Stripe.Charge | null | undefined;
  if (charge && typeof charge === "object") {
    const cardPresent = charge.payment_method_details?.card_present;
    const card = charge.payment_method_details?.card;
    cardBrand = cardPresent?.brand ?? card?.brand ?? null;
    cardLast4 = cardPresent?.last4 ?? card?.last4 ?? null;
  }

  // Tip is exposed under amount_details.tip on tipped Terminal charges
  const tipAmount = (pi as unknown as { amount_details?: { tip?: { amount?: number } } })
    .amount_details?.tip?.amount ?? 0;

  return {
    status,
    payment_intent_id: pi.id,
    amount_cents: pi.amount ?? null,
    raw_status: pi.status,
    last_error: pi.last_payment_error?.message ?? null,
    tip_cents: tipAmount,
    card_brand: cardBrand,
    card_last4: cardLast4,
  };
}

/**
 * Build a deterministic Stripe Idempotency-Key from a client transaction
 * ID and an operation name. Same inputs → same key, so retries that hit
 * Stripe twice are safely deduplicated server-side.
 *
 * Example:
 *   buildIdempotencyKey("tx_1730000000_abc123", "payment-intent")
 *   → "tx_1730000000_abc123-payment-intent"
 *
 * Stripe enforces a 255-char limit; we stay well under it by construction.
 */
export function buildIdempotencyKey(
  clientTxId: string,
  operation: string,
): string {
  if (!clientTxId) throw new Error("clientTxId required");
  if (!operation) throw new Error("operation required");
  return `${clientTxId}-${operation}`;
}
