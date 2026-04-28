/**
 * POST /api/register/connection-token
 *
 * Stripe Terminal connection-token endpoint, API-key authed for the
 * register app. The Stripe Terminal SDK calls this to authenticate
 * with NFC/BT readers (Tap-to-Pay-on-Android counts as a "reader").
 *
 * Mirrors the existing /api/stripe/terminal endpoint (which is session-
 * authed for the dashboard /register surface) but is reachable from the
 * register's X-API-Key path.
 *
 * The token is short-lived (~3 minutes) and scoped to the merchant's
 * Stripe account. Connection tokens are NOT secret in the same way
 * sk_live keys are — they only allow Terminal SDK operations.
 *
 * Auth: API key with `register:write` scope.
 */

import { NextResponse } from "next/server";
import { withApiKey } from "@/lib/api-middleware";
import { getStripe } from "@/lib/stripe";

export const POST = withApiKey<Record<string, never>>(async () => {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured on this Store Ops deployment." },
      { status: 503 },
    );
  }

  try {
    const token = await stripe.terminal.connectionTokens.create();
    return NextResponse.json({ secret: token.secret });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}, "register:write");
