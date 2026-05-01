import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, verifyEmailTemplate } from "@/lib/email";
import { assignPassportCode } from "@/lib/passport-code";
import { readAgeGateCookie, classifyAge, isUnder13Blocked } from "@/lib/age-gate";

/* ------------------------------------------------------------------ */
/*  POST /api/auth/signup                                              */
/*                                                                      */
/*  Email + password signup. Creates a User with passwordHash, queues  */
/*  a 24-hour verification token, and emails the link. The user can't  */
/*  sign in via the Credentials provider until they click the link     */
/*  (the authorize() in auth-config throws "EmailNotVerified").        */
/*                                                                      */
/*  Body: { email, password, displayName? }                             */
/*                                                                      */
/*  Response shape is intentionally identical for "created" and         */
/*  "already exists" so we don't expose which emails are registered.   */
/* ------------------------------------------------------------------ */

const VERIFY_TOKEN_TTL_HOURS = 24;
const PASSWORD_MIN_LENGTH = 8;

function generateToken(): string {
  // 32 bytes → 64-char hex. Stored on VerificationToken.token (which is unique).
  return randomBytes(32).toString("hex");
}

function buildVerifyUrl(token: string, email: string): string {
  const base =
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    "https://afterroar.me";
  const url = new URL("/verify-email", base);
  url.searchParams.set("token", token);
  url.searchParams.set("email", email);
  return url.toString();
}

export async function POST(request: NextRequest) {
  let body: {
    email?: string;
    password?: string;
    displayName?: string;
    confirmedAdult?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const displayName =
    body.displayName && String(body.displayName).trim().length > 0
      ? String(body.displayName).trim()
      : null;
  const confirmedAdult = body.confirmedAdult === true;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` },
      { status: 400 },
    );
  }

  // Age-gate enforcement (distillery model). The default adult signup
  // path requires either:
  //   - confirmedAdult: true in the body (the 18+ checkbox on /signup), OR
  //   - an "adult" age-gate cookie (the user came through /signup/age
  //     and entered a DOB making them 18+)
  // Teens go through /api/auth/parental-consent/request and never hit
  // this endpoint. <13 users are blocked even if they somehow get here.
  if (await isUnder13Blocked()) {
    return NextResponse.json(
      { error: "This account cannot be created on this device." },
      { status: 403 },
    );
  }
  const ageCookie = await readAgeGateCookie();
  let dob: Date | null = null;
  if (ageCookie) {
    if (ageCookie.cohort !== "adult") {
      return NextResponse.json(
        { error: "This signup path is for adults only." },
        { status: 403 },
      );
    }
    // Defense in depth: re-validate the DOB classifies as adult right now.
    const candidate = new Date(ageCookie.dob);
    const reclassified = classifyAge(candidate);
    if (reclassified.cohort !== "adult") {
      return NextResponse.json(
        { error: "Age verification stale; please start over." },
        { status: 400 },
      );
    }
    dob = candidate;
  } else if (!confirmedAdult) {
    return NextResponse.json(
      { error: "Please confirm you are 18 or older to create an account." },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  // Already exists with a verified email + password → just resend nothing,
  // tell them to log in. Don't leak which emails are registered.
  if (existing && existing.passwordHash && existing.emailVerified) {
    return NextResponse.json({
      ok: true,
      // Generic message so a probe can't tell registered vs. unregistered.
      message: "Check your email to verify your account.",
    });
  }

  // If a User row already exists (created via Google OAuth), we DON'T create
  // a duplicate — we add a passwordHash to the existing row. They can then
  // log in via either Google or email/password.
  // SECURITY NOTE: Skip this branch entirely if the OAuth-created user has
  // never verified an email — would let a probe set a password they can use.
  // Google sets emailVerified at signup, so a verified row means OAuth wrote it.
  if (existing && !existing.passwordHash && existing.emailVerified) {
    const passwordHash = await hash(password, 12);
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        ...(displayName && !existing.displayName ? { displayName } : {}),
      },
    });
    return NextResponse.json({
      ok: true,
      message: "Password set. You can now sign in with email or Google.",
    });
  }

  // Brand-new signup OR existing-but-unverified row → create or update + token.
  const passwordHash = await hash(password, 12);
  const userId = existing?.id;

  const user = userId
    ? await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          ...(displayName ? { displayName } : {}),
          // Only set DOB if we actually have one from the age-gate cookie.
          // Self-attestation users have no DOB on file, which is intentional:
          // we only collect what we need.
          ...(dob ? { dateOfBirth: dob } : {}),
          isMinor: false,
        },
      })
    : await prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName,
          ...(dob ? { dateOfBirth: dob } : {}),
          isMinor: false,
          // Adults default to public visibility; minors default to "circle"
          // (handled in the parental-consent approval path).
          defaultVisibility: "public",
        },
      });

  // Generate the passport code at signup time. NextAuth's events.createUser
  // doesn't fire for our custom email-signup flow (it only fires for
  // NextAuth-initiated user creation, i.e. OAuth providers), so we have to
  // call the shared helper directly here. Best-effort: a failure here
  // shouldn't block signup — the helper logs internally and returns null.
  await assignPassportCode(user.id).catch((err) =>
    console.error("[signup] assignPassportCode failed:", err),
  );

  // Generate verification token + persist
  const token = generateToken();
  const expires = new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  // Clear any existing tokens for this email so old links don't linger.
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  await prisma.verificationToken.create({
    data: { identifier: email, token, expires },
  });

  const verifyUrl = buildVerifyUrl(token, email);
  const tpl = verifyEmailTemplate(verifyUrl, user.displayName);
  // Fire-and-forget: response doesn't depend on email delivery.
  sendEmail({ to: email, ...tpl }).catch((err) =>
    console.error("[signup] email send failed", err),
  );

  return NextResponse.json({
    ok: true,
    message: "Check your email to verify your account.",
    // Helpful in dev when no Resend key is set
    ...(process.env.NODE_ENV !== "production" ? { dev_verify_url: verifyUrl } : {}),
  });
}
