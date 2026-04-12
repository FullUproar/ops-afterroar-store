import { NextResponse } from "next/server";
import { requireStaff, handleAuthError } from "@/lib/require-staff";
import Stripe from "stripe";

/**
 * POST /api/stripe/terminal — create a connection token
 * The Stripe Terminal JS SDK calls this to authenticate with readers.
 */
export async function POST() {
  try {
    await requireStaff();

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 400 }
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Create a connection token (direct account, not connected)
    const token = await stripe.terminal.connectionTokens.create();

    return NextResponse.json({ secret: token.secret });
  } catch (error) {
    return handleAuthError(error);
  }
}
