/* ------------------------------------------------------------------ */
/*  Payment Abstraction Layer                                           */
/*                                                                      */
/*  Providers:                                                          */
/*    CashPaymentProvider       — always succeeds (cash at register)    */
/*    SimulatedCardProvider     — dev/test mode (no real charges)       */
/*    StripeConnectProvider     — real card payments via Stripe Connect */
/*    ExternalPaymentProvider   — "process on your own terminal"       */
/*    StoreCreditProvider       — validates balance (DB deduction in API) */
/*                                                                      */
/*  The checkout API calls processPayment() which routes to the right  */
/*  provider based on payment method + environment config.             */
/* ------------------------------------------------------------------ */

export type PaymentMethod = "cash" | "card" | "store_credit" | "split" | "external" | "gift_card";

export interface PaymentResult {
  success: boolean;
  transaction_id: string;
  method: PaymentMethod;
  provider: string;
  error?: string;
  /** Stripe-specific: payment intent ID for reconciliation */
  stripe_payment_intent_id?: string;
  /** Whether this was processed on a real terminal vs simulated */
  live: boolean;
}

export interface PaymentProvider {
  charge(amount_cents: number, metadata?: Record<string, unknown>): Promise<PaymentResult>;
  refund?(transaction_id: string, amount_cents: number, options?: { idempotency_key?: string }): Promise<PaymentResult>;
  name: string;
}

function generateTransactionId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

/** Check if we should use real Stripe or simulated */
export function isLivePayments(): boolean {
  // If STRIPE_SECRET_KEY is set directly, always use real Stripe
  if (process.env.STRIPE_SECRET_KEY) return true;
  return process.env.PAYMENT_MODE === "live" || process.env.PAYMENT_MODE === "test";
}

export function isTestPayments(): boolean {
  // Auto-detect from key prefix
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (key.startsWith("sk_test_")) return true;
  return process.env.PAYMENT_MODE === "test";
}

/** Check if Stripe is configured at all */
export function isStripeAvailable(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST);
}

/* ------------------------------------------------------------------ */
/*  Cash — always succeeds immediately                                 */
/* ------------------------------------------------------------------ */
export class CashPaymentProvider implements PaymentProvider {
  name = "cash";

  async charge(amount_cents: number): Promise<PaymentResult> {
    return {
      success: true,
      transaction_id: generateTransactionId("CASH"),
      method: "cash",
      provider: "cash",
      live: true, // Cash is always "live"
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Simulated Card — dev/test mode, no real charges                    */
/* ------------------------------------------------------------------ */
export class SimulatedCardProvider implements PaymentProvider {
  name = "simulated_card";

  async charge(amount_cents: number): Promise<PaymentResult> {
    await new Promise((r) => setTimeout(r, 500));
    return {
      success: true,
      transaction_id: generateTransactionId("SIM_CARD"),
      method: "card",
      provider: "simulated",
      live: false,
    };
  }

  async refund(transaction_id: string, amount_cents: number): Promise<PaymentResult> {
    await new Promise((r) => setTimeout(r, 300));
    return {
      success: true,
      transaction_id: generateTransactionId("SIM_REFUND"),
      method: "card",
      provider: "simulated",
      live: false,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Stripe Direct — real card payments on the platform account          */
/*  Used when no Connected account is set up yet.                       */
/*  In test mode, auto-confirms with pm_card_visa.                      */
/*  Server-side: creates PaymentIntent directly via Stripe SDK.         */
/* ------------------------------------------------------------------ */
export class StripePaymentProvider implements PaymentProvider {
  name = "stripe_direct";

  async charge(
    amount_cents: number,
    metadata?: Record<string, unknown>
  ): Promise<PaymentResult> {
    try {
      const Stripe = (await import("stripe")).default;
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return {
          success: false,
          transaction_id: "",
          method: "card",
          provider: "stripe_direct",
          error: "Stripe is not configured",
          live: false,
        };
      }

      const stripe = new Stripe(stripeKey);
      const isTest = stripeKey.startsWith("sk_test_");

      // Idempotency: when caller passes client_tx_id via metadata, Stripe
      // de-duplicates the PI creation if we retry after a network blip.
      const clientTxId = metadata?.client_tx_id as string | undefined;
      const idempotencyKey = clientTxId
        ? `${clientTxId}-stripe-direct-charge`
        : undefined;

      // Create and auto-confirm a PaymentIntent
      // In test mode: use pm_card_visa (always succeeds)
      const paymentIntent = await stripe.paymentIntents.create(
        {
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
            ...Object.fromEntries(
              Object.entries(metadata || {}).map(([k, v]) => [k, String(v)])
            ),
            source: "afterroar_store_ops",
            ...(isTest ? { test_mode: "true" } : {}),
          },
        },
        idempotencyKey ? { idempotencyKey } : undefined,
      );

      return {
        success: true,
        transaction_id: paymentIntent.id,
        method: "card",
        provider: "stripe_direct",
        stripe_payment_intent_id: paymentIntent.id,
        live: !isTest,
      };
    } catch (err) {
      return {
        success: false,
        transaction_id: "",
        method: "card",
        provider: "stripe_direct",
        error: err instanceof Error ? err.message : "Stripe payment failed",
        live: false,
      };
    }
  }

  async refund(
    transaction_id: string,
    amount_cents: number,
    options?: { idempotency_key?: string }
  ): Promise<PaymentResult> {
    try {
      const Stripe = (await import("stripe")).default;
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return {
          success: false,
          transaction_id: "",
          method: "card",
          provider: "stripe_direct",
          error: "Stripe is not configured",
          live: false,
        };
      }
      const stripe = new Stripe(stripeKey);
      // Idempotency on refunds: avoid double-refunding if a retry races.
      const refundIdempotency =
        options?.idempotency_key ??
        `refund-${transaction_id}-${amount_cents}`;
      const refund = await stripe.refunds.create(
        {
          payment_intent: transaction_id,
          amount: amount_cents,
        },
        { idempotencyKey: refundIdempotency },
      );
      return {
        success: true,
        transaction_id: refund.id,
        method: "card",
        provider: "stripe_direct",
        live: !isTestPayments(),
      };
    } catch (err) {
      return {
        success: false,
        transaction_id: "",
        method: "card",
        provider: "stripe_direct",
        error: err instanceof Error ? err.message : "Stripe refund failed",
        live: false,
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Stripe Connect — real card payments via the store's Stripe account */
/*                                                                      */
/*  Uses Stripe Terminal JS SDK for in-person payments.                 */
/*  The store must have a connected Stripe account.                     */
/*                                                                      */
/*  Server-side: creates a PaymentIntent on the connected account.     */
/*  Client-side: Terminal SDK collects the payment on the reader.       */
/*                                                                      */
/*  This provider handles the SERVER side (PaymentIntent creation).     */
/*  The client-side reader interaction is in stripe-terminal.ts.        */
/* ------------------------------------------------------------------ */
export class StripeConnectProvider implements PaymentProvider {
  name = "stripe_connect";
  private connectedAccountId: string;

  constructor(connectedAccountId: string) {
    this.connectedAccountId = connectedAccountId;
  }

  async charge(
    amount_cents: number,
    metadata?: Record<string, unknown>
  ): Promise<PaymentResult> {
    try {
      // Dynamic import to avoid loading Stripe on every request
      const Stripe = (await import("stripe")).default;
      const stripeKey = isTestPayments()
        ? process.env.STRIPE_SECRET_KEY_TEST
        : process.env.STRIPE_SECRET_KEY;

      if (!stripeKey) {
        return {
          success: false,
          transaction_id: "",
          method: "card",
          provider: "stripe_connect",
          error: "Stripe is not configured",
          live: false,
        };
      }

      const stripe = new Stripe(stripeKey);

      // Idempotency: same client_tx_id → same PI on retry, never double.
      const clientTxId = metadata?.client_tx_id as string | undefined;
      const idempotencyKey = clientTxId
        ? `${clientTxId}-stripe-connect-charge`
        : undefined;

      // Create a PaymentIntent on the connected account
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: amount_cents,
          currency: "usd",
          payment_method_types: ["card_present"],
          capture_method: "automatic",
          metadata: {
            ...metadata,
            source: "afterroar_store_ops",
          },
        },
        {
          stripeAccount: this.connectedAccountId,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        }
      );

      return {
        success: true,
        transaction_id: paymentIntent.id,
        method: "card",
        provider: "stripe_connect",
        stripe_payment_intent_id: paymentIntent.id,
        live: !isTestPayments(),
      };
    } catch (err) {
      return {
        success: false,
        transaction_id: "",
        method: "card",
        provider: "stripe_connect",
        error: err instanceof Error ? err.message : "Stripe payment failed",
        live: false,
      };
    }
  }

  async refund(
    transaction_id: string,
    amount_cents: number,
    options?: { idempotency_key?: string }
  ): Promise<PaymentResult> {
    try {
      const Stripe = (await import("stripe")).default;
      const stripeKey = isTestPayments()
        ? process.env.STRIPE_SECRET_KEY_TEST
        : process.env.STRIPE_SECRET_KEY;

      if (!stripeKey) {
        return {
          success: false,
          transaction_id: "",
          method: "card",
          provider: "stripe_connect",
          error: "Stripe is not configured",
          live: false,
        };
      }

      const stripe = new Stripe(stripeKey);

      const refundIdempotency =
        options?.idempotency_key ??
        `refund-connect-${transaction_id}-${amount_cents}`;

      const refund = await stripe.refunds.create(
        {
          payment_intent: transaction_id,
          amount: amount_cents,
        },
        {
          stripeAccount: this.connectedAccountId,
          idempotencyKey: refundIdempotency,
        }
      );

      return {
        success: true,
        transaction_id: refund.id,
        method: "card",
        provider: "stripe_connect",
        live: !isTestPayments(),
      };
    } catch (err) {
      return {
        success: false,
        transaction_id: "",
        method: "card",
        provider: "stripe_connect",
        error: err instanceof Error ? err.message : "Stripe refund failed",
        live: false,
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  External Terminal — store processes on their own terminal           */
/*  We just record that it happened. No actual payment processing.     */
/*                                                                      */
/*  UI flow: cashier selects "External Terminal" →                      */
/*  screen shows "Process $47.23 on your terminal" →                   */
/*  cashier confirms "Payment received" →                               */
/*  we create the ledger entry.                                         */
/* ------------------------------------------------------------------ */
export class ExternalPaymentProvider implements PaymentProvider {
  name = "external";

  async charge(amount_cents: number): Promise<PaymentResult> {
    // No actual processing — the cashier confirmed externally
    return {
      success: true,
      transaction_id: generateTransactionId("EXT"),
      method: "external",
      provider: "external_terminal",
      live: true, // It was a real payment, just not through us
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Store Credit — checks balance, returns success/fail                */
/*  (actual DB deduction happens in the API route)                     */
/* ------------------------------------------------------------------ */
export class StoreCreditProvider implements PaymentProvider {
  name = "store_credit";
  private balance_cents: number;

  constructor(customer_credit_balance_cents: number) {
    this.balance_cents = customer_credit_balance_cents;
  }

  async charge(amount_cents: number): Promise<PaymentResult> {
    if (amount_cents > this.balance_cents) {
      return {
        success: false,
        transaction_id: "",
        method: "store_credit",
        provider: "store_credit",
        error: `Insufficient store credit. Balance: ${this.balance_cents}, required: ${amount_cents}`,
        live: true,
      };
    }
    return {
      success: true,
      transaction_id: generateTransactionId("CREDIT"),
      method: "store_credit",
      provider: "store_credit",
      live: true,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  processPayment — top-level helper                                  */
/*  Routes to the right provider based on method + environment.        */
/* ------------------------------------------------------------------ */
export async function processPayment(
  method: PaymentMethod,
  amount_cents: number,
  options?: {
    customer_credit_balance_cents?: number;
    stripe_connected_account_id?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<PaymentResult> {
  let provider: PaymentProvider;

  switch (method) {
    case "cash":
      provider = new CashPaymentProvider();
      break;

    case "card": {
      // Use Stripe Connect if configured, otherwise direct Stripe, otherwise simulated
      const connectedId = options?.stripe_connected_account_id;
      if (connectedId && isLivePayments()) {
        provider = new StripeConnectProvider(connectedId);
      } else if (isStripeAvailable()) {
        provider = new StripePaymentProvider();
      } else {
        provider = new SimulatedCardProvider();
      }
      break;
    }

    case "external":
      provider = new ExternalPaymentProvider();
      break;

    case "store_credit":
      provider = new StoreCreditProvider(options?.customer_credit_balance_cents ?? 0);
      break;

    case "gift_card":
      // Gift card deduction is handled in the checkout API route directly;
      // this just validates the payment step succeeds.
      provider = new ExternalPaymentProvider();
      break;

    case "split": {
      // For split payments the API route handles the two legs separately;
      // this just validates the card portion succeeds.
      const splitConnectedId = options?.stripe_connected_account_id;
      if (splitConnectedId && isLivePayments()) {
        provider = new StripeConnectProvider(splitConnectedId);
      } else if (isStripeAvailable()) {
        provider = new StripePaymentProvider();
      } else {
        provider = new SimulatedCardProvider();
      }
      break;
    }

    default:
      return {
        success: false,
        transaction_id: "",
        method,
        provider: "unknown",
        error: `Unknown payment method: ${method}`,
        live: false,
      };
  }

  return provider.charge(amount_cents, options?.metadata);
}

/* ------------------------------------------------------------------ */
/*  processRefund — refund via the original payment provider           */
/* ------------------------------------------------------------------ */
export async function processRefund(
  original_transaction_id: string,
  amount_cents: number,
  options?: {
    stripe_connected_account_id?: string;
    /**
     * Idempotency key forwarded to Stripe — prevents double-refunds
     * if the refund flow is retried after a network failure. Caller
     * should derive this from a stable identifier such as the original
     * client_tx_id plus operation, e.g. `${clientTxId}-refund`.
     */
    idempotency_key?: string;
  }
): Promise<PaymentResult> {
  // Determine provider from transaction ID prefix
  if (original_transaction_id.startsWith("CASH")) {
    // Cash refunds are manual — just record it
    return {
      success: true,
      transaction_id: generateTransactionId("CASH_REFUND"),
      method: "cash",
      provider: "cash",
      live: true,
    };
  }

  if (original_transaction_id.startsWith("EXT")) {
    return {
      success: true,
      transaction_id: generateTransactionId("EXT_REFUND"),
      method: "external",
      provider: "external_terminal",
      live: true,
    };
  }

  if (original_transaction_id.startsWith("pi_")) {
    // Stripe PaymentIntent — refund through Stripe
    const connectedId = options?.stripe_connected_account_id;
    if (connectedId) {
      const provider = new StripeConnectProvider(connectedId);
      return provider.refund!(original_transaction_id, amount_cents, {
        idempotency_key: options?.idempotency_key,
      });
    }
    // Direct Stripe refund (no connected account)
    if (isStripeAvailable()) {
      const provider = new StripePaymentProvider();
      return provider.refund!(original_transaction_id, amount_cents, {
        idempotency_key: options?.idempotency_key,
      });
    }
  }

  // Simulated — just succeed
  return {
    success: true,
    transaction_id: generateTransactionId("SIM_REFUND"),
    method: "card",
    provider: "simulated",
    live: false,
  };
}
