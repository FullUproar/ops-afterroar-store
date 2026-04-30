import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pushVerifiedCountToSmiirl } from "@/lib/smiirl";

/* ------------------------------------------------------------------ */
/*  GET /api/auth/verify-email?token=...&email=...                     */
/*                                                                      */
/*  Consumed by the email verification flow. Looks up the token, marks  */
/*  the matching user as emailVerified, and consumes the token (delete) */
/*  so it can't be replayed.                                            */
/*                                                                      */
/*  Used by /verify-email page (client) and also linkable directly from */
/*  the email — both call this and trust the server response.           */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const email = request.nextUrl.searchParams.get("email")?.toLowerCase();

  if (!token || !email) {
    return NextResponse.json(
      { ok: false, error: "Missing token or email" },
      { status: 400 },
    );
  }

  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  });

  if (!record) {
    return NextResponse.json(
      { ok: false, error: "Invalid or already-used verification link" },
      { status: 404 },
    );
  }

  if (record.expires < new Date()) {
    await prisma.verificationToken
      .delete({ where: { identifier_token: { identifier: email, token } } })
      .catch(() => {});
    return NextResponse.json(
      { ok: false, error: "Verification link has expired. Sign up again to get a new one." },
      { status: 410 },
    );
  }

  // Mark verified + consume token
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.delete({
      where: { identifier_token: { identifier: email, token } },
    }),
  ]);

  // Fire-and-forget push to the Smiirl counter so the convention display
  // updates within ~1 second of a successful verification, instead of
  // waiting for the hourly cron. No-op if SMIIRL_DEVICE_MAC isn't set.
  pushVerifiedCountToSmiirl().catch((err) =>
    console.error("[verify-email] Smiirl push failed:", err),
  );

  return NextResponse.json({ ok: true, email });
}
