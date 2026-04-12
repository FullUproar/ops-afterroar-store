import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/require-staff";
import { getStripe } from "@/lib/stripe";

/* ------------------------------------------------------------------ */
/*  GET /api/stripe/connect — get store's Stripe Connect status         */
/* ------------------------------------------------------------------ */
export async function GET() {
  try {
    const { storeId } = await requirePermission("store.settings");

    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });

    const settings = (store?.settings ?? {}) as Record<string, unknown>;
    const connectedAccountId = settings.stripe_connected_account_id as string | undefined;

    if (!connectedAccountId) {
      return NextResponse.json({
        connected: false,
        account_id: null,
        details_submitted: false,
        charges_enabled: false,
        payouts_enabled: false,
      });
    }

    // Check account status with Stripe
    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json({
        connected: true,
        account_id: connectedAccountId,
        details_submitted: null,
        charges_enabled: null,
        payouts_enabled: null,
        note: "Stripe not configured — cannot verify account status",
      });
    }

    const account = await stripe.accounts.retrieve(connectedAccountId);

    return NextResponse.json({
      connected: true,
      account_id: connectedAccountId,
      details_submitted: account.details_submitted,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      business_profile: account.business_profile,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/stripe/connect — start Stripe Connect onboarding          */
/*  Creates a Connect account and returns an onboarding URL.            */
/* ------------------------------------------------------------------ */
export async function POST() {
  try {
    const { storeId } = await requirePermission("store.settings");

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe is not configured. Set PAYMENT_MODE and STRIPE_SECRET_KEY." },
        { status: 400 }
      );
    }

    const store = await prisma.posStore.findUnique({
      where: { id: storeId },
      select: { name: true, settings: true },
    });
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const settings = (store.settings ?? {}) as Record<string, unknown>;
    let connectedAccountId = settings.stripe_connected_account_id as string | undefined;

    // Create a new Connect account if one doesn't exist
    if (!connectedAccountId) {
      const account = await stripe.accounts.create({
        type: "standard", // Standard account — store manages their own Stripe dashboard
        business_profile: {
          name: store.name,
          product_description: "Friendly local game store",
        },
        metadata: {
          afterroar_store_id: storeId,
        },
      });

      connectedAccountId = account.id;

      // Save the connected account ID to store settings
      await prisma.posStore.update({
        where: { id: storeId },
        data: {
          settings: { ...settings, stripe_connected_account_id: connectedAccountId },
          updated_at: new Date(),
        },
      });
    }

    // Create an Account Link for onboarding
    const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "https://ops.afterroar.store";
    const accountLink = await stripe.accountLinks.create({
      account: connectedAccountId,
      refresh_url: `${baseUrl}/dashboard/settings?stripe=refresh`,
      return_url: `${baseUrl}/dashboard/settings?stripe=complete`,
      type: "account_onboarding",
    });

    return NextResponse.json({
      account_id: connectedAccountId,
      onboarding_url: accountLink.url,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
