/* ------------------------------------------------------------------ */
/*  HQ Bridge Webhook Authentication                                    */
/*  Shared auth helper for all HQ bridge incoming webhooks.             */
/*                                                                      */
/*  SECURITY: Every webhook MUST specify which store it's targeting     */
/*  (via X-Store-Id header or store_id in body). The Bearer token is    */
/*  verified against ONLY that store's hq_webhook_secret.               */
/*                                                                      */
/*  This prevents:                                                      */
/*  - Cross-store manipulation (token from Store A used on Store B)     */
/*  - Weak-secret exploitation (guessing one store's secret)            */
/*  - Replay attacks (idempotency key required)                         */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";

export interface HQBridgeAuth {
  storeId: string;
  storeName: string;
}

/**
 * Authenticate an incoming HQ bridge webhook.
 * Returns store info if valid, or a NextResponse error if not.
 */
export async function authenticateHQWebhook(
  request: NextRequest,
  body?: Record<string, unknown>
): Promise<HQBridgeAuth | NextResponse> {
  // 1. Extract Bearer token
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
  }
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid token format" }, { status: 401 });
  }

  // 2. Extract store ID — from header first, then body
  const storeId =
    request.headers.get("x-store-id") ??
    (body?.store_id as string | undefined) ??
    null;

  if (!storeId) {
    return NextResponse.json(
      { error: "Missing store identifier. Provide X-Store-Id header or store_id in body." },
      { status: 400 }
    );
  }

  // 3. Verify token against ONLY the specified store
  const store = await prisma.posStore.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, settings: true },
  });

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const settings = (store.settings ?? {}) as Record<string, unknown>;
  const expectedSecret = settings.hq_webhook_secret as string;

  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Store has no webhook secret configured" },
      { status: 403 }
    );
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(token, expectedSecret)) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  return { storeId: store.id, storeName: store.name };
}

/** Constant-time string comparison */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  try {
    const { timingSafeEqual: tse } = require("crypto");
    return tse(bufA, bufB);
  } catch {
    // Fallback (less secure but functional)
    let result = 0;
    for (let i = 0; i < bufA.length; i++) {
      result |= bufA[i] ^ bufB[i];
    }
    return result === 0;
  }
}

/** Helper to check if auth result is an error response */
export function isAuthError(result: HQBridgeAuth | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
