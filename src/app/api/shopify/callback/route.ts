import { NextRequest, NextResponse } from "next/server";

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || "";

/**
 * GET /api/shopify/callback — OAuth callback from Shopify
 * Exchanges the auth code for an access token.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const shop = request.nextUrl.searchParams.get("shop");

  if (!code || !shop) {
    return new NextResponse("Missing code or shop parameter", { status: 400 });
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.access_token) {
      // Show the token (one-time display)
      return new NextResponse(`<!DOCTYPE html>
<html><body style="font-family:system-ui;background:#0a0a0a;color:#fff;padding:40px;max-width:600px;margin:0 auto">
<h2>Shopify Connected!</h2>
<p style="color:#4ade80">Access token obtained successfully.</p>
<div style="background:#1a1a2e;padding:16px;border-radius:8px;margin:16px 0">
<p style="color:#999;margin:0 0 8px">Access Token (save this — shown once):</p>
<code style="color:#FF8200;word-break:break-all;font-size:14px">${tokenData.access_token}</code>
</div>
<p style="color:#999;font-size:12px">Scope: ${tokenData.scope || "all requested"}</p>
<p style="color:#999;font-size:12px">Shop: ${shop}</p>
</body></html>`, {
        headers: { "Content-Type": "text/html" },
      });
    } else {
      return new NextResponse(`Token exchange failed: ${JSON.stringify(tokenData)}`, { status: 500 });
    }
  } catch (err) {
    return new NextResponse(`Error: ${err instanceof Error ? err.message : "Unknown"}`, { status: 500 });
  }
}
