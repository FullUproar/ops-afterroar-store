/**
 * eBay Marketplace Account Deletion/Closure Notification endpoint.
 *
 * Required by eBay Developers Program for all apps that use eBay APIs.
 *
 * GET:  Challenge code verification (eBay validates our endpoint)
 * POST: Account deletion notification (eBay tells us to delete user data)
 *
 * Env vars needed:
 *   EBAY_VERIFICATION_TOKEN — 32-80 char alphanumeric token set in eBay Developer Portal
 *   EBAY_ENDPOINT_URL — the full URL of this endpoint (must match what's in eBay Portal)
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

const VERIFICATION_TOKEN = process.env.EBAY_VERIFICATION_TOKEN || "";
const ENDPOINT_URL =
  process.env.EBAY_ENDPOINT_URL ||
  "https://www.afterroar.store/api/ebay/account-deletion";

/**
 * GET — eBay sends a challenge_code to verify we own this endpoint.
 * We hash: challengeCode + verificationToken + endpoint → SHA-256 hex
 * Return as JSON: { challengeResponse: "<hash>" }
 */
export async function GET(request: NextRequest) {
  const challengeCode = request.nextUrl.searchParams.get("challenge_code");

  if (!challengeCode) {
    return NextResponse.json(
      { error: "Missing challenge_code parameter" },
      { status: 400 }
    );
  }

  if (!VERIFICATION_TOKEN) {
    console.error(
      "EBAY_VERIFICATION_TOKEN not set. Cannot respond to eBay challenge."
    );
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  // Hash: challengeCode + verificationToken + endpoint (in this order)
  const hash = createHash("sha256");
  hash.update(challengeCode);
  hash.update(VERIFICATION_TOKEN);
  hash.update(ENDPOINT_URL);
  const challengeResponse = hash.digest("hex");

  return NextResponse.json(
    { challengeResponse },
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * POST — eBay notifies us that a user has requested account deletion.
 * We must:
 * 1. Immediately acknowledge with 200
 * 2. Delete any stored data for this eBay user
 *
 * Notification payload:
 * {
 *   metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", ... },
 *   notification: {
 *     notificationId: "...",
 *     data: { username: "...", userId: "...", eiasToken: "..." }
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const topic = body?.metadata?.topic;
  const userId = body?.notification?.data?.userId;
  const username = body?.notification?.data?.username;
  const notificationId = body?.notification?.notificationId;

  console.log(
    `[eBay Account Deletion] Received notification ${notificationId}: topic=${topic}, userId=${userId}, username=${username}`
  );

  if (topic === "MARKETPLACE_ACCOUNT_DELETION" && userId) {
    // TODO: When eBay marketplace sync is built, delete stored data here:
    // - Remove eBay listings linked to this user
    // - Remove eBay order data linked to this user
    // - Remove any cached eBay profile data
    //
    // For now we don't store any eBay user data, so just log and acknowledge.

    console.log(
      `[eBay Account Deletion] Would delete data for eBay user ${userId} (${username}). No eBay data stored yet.`
    );
  }

  // Acknowledge receipt — eBay accepts 200, 201, 202, or 204
  return new NextResponse(null, { status: 200 });
}
