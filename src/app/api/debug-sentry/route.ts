import { NextResponse } from "next/server";

/* Test endpoint — triggers a Sentry error. Delete after verification. */

export async function GET() {
  throw new Error("Sentry test error — delete me after verification");
}

export async function POST() {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureException(new Error("Sentry manual capture test — delete me"));
  return NextResponse.json({ sent: true, check: "sentry.io/issues" });
}
