import { NextResponse } from "next/server";
import { requirePermissionAndFeature, handleAuthError } from "@/lib/require-staff";
import { getEbayAuthUrl } from "@/lib/ebay";

/* ------------------------------------------------------------------ */
/*  GET /api/ebay/connect — redirect to eBay OAuth consent page        */
/*  Initiates the OAuth flow for connecting a store's eBay account.    */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const { storeId } = await requirePermissionAndFeature("store.settings", "ecommerce");

    const authUrl = getEbayAuthUrl(storeId);
    if (!authUrl) {
      return NextResponse.json(
        { error: "eBay OAuth not configured. Set EBAY_CLIENT_ID and EBAY_REDIRECT_URI env vars." },
        { status: 500 },
      );
    }

    return NextResponse.json({ auth_url: authUrl });
  } catch (error) {
    return handleAuthError(error);
  }
}
