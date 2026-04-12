/* ------------------------------------------------------------------ */
/*  Stripe client setup for Store Ops                                   */
/*                                                                      */
/*  Two Stripe relationships:                                           */
/*  1. Platform (FU's account) — creates Connect accounts, manages      */
/*     Terminal connection tokens, receives webhooks                    */
/*  2. Connected accounts (stores) — where money flows                  */
/*                                                                      */
/*  Env vars:                                                           */
/*    STRIPE_SECRET_KEY         — Stripe secret key (sk_test_ or sk_live_) */
/*    STRIPE_SECRET_KEY_TEST    — (legacy) FU's test Stripe secret key */
/*    STRIPE_WEBHOOK_SECRET     — for verifying webhook signatures      */
/*    PAYMENT_MODE              — "dev" | "test" | "live"              */
/*                                                                      */
/*  Resolution order:                                                   */
/*  1. If STRIPE_SECRET_KEY is set, use it directly (auto-detects       */
/*     test vs live from the key prefix: sk_test_ vs sk_live_)          */
/*  2. If PAYMENT_MODE is set, use it to pick the right key             */
/*  3. Default: dev mode (no Stripe)                                    */
/* ------------------------------------------------------------------ */

import Stripe from "stripe";

const STRIPE_API_VERSION = "2025-03-31.basil" as Stripe.LatestApiVersion;

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (stripeInstance) return stripeInstance;

  // If STRIPE_SECRET_KEY is set directly (sk_test_ or sk_live_), use it
  const directKey = process.env.STRIPE_SECRET_KEY;
  if (directKey) {
    stripeInstance = new Stripe(directKey, {
      apiVersion: STRIPE_API_VERSION,
    });
    return stripeInstance;
  }

  // Legacy: use PAYMENT_MODE to pick the right key
  const mode = process.env.PAYMENT_MODE ?? "dev";
  if (mode === "dev") return null;

  const key =
    mode === "test"
      ? process.env.STRIPE_SECRET_KEY_TEST
      : process.env.STRIPE_SECRET_KEY;

  if (!key) return null;

  stripeInstance = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
  });

  return stripeInstance;
}

/** Check if Stripe is configured and available */
export function isStripeConfigured(): boolean {
  return getStripe() !== null;
}

/** Check if we're using test mode keys */
export function isStripeTestMode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY_TEST ?? "";
  return key.startsWith("sk_test_");
}
