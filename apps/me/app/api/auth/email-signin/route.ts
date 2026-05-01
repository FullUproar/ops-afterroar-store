import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendEmail, magicLinkTemplate } from '@/lib/email';

const TOKEN_TTL_MINUTES = 15;
const TOKEN_PREFIX = 'signin:';
const SLOW_RESPONSE_MS = 250;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function buildSigninUrl(token: string, email: string): string {
  const base =
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    'https://afterroar.me';
  const url = new URL('/signin-with-link', base);
  url.searchParams.set('token', token);
  url.searchParams.set('email', email);
  return url.toString();
}

/**
 * POST /api/auth/email-signin
 *
 * Body: { email: string }
 *
 * Magic-link sign-in: emails a one-time link that signs the user in
 * without a password. Becoming standard UX for consumer apps; we
 * support it alongside email/password and Google.
 *
 * Generic 200 response regardless of whether email is registered to
 * prevent account enumeration. Sleep equalizes timing so the
 * "send email" path doesn't take measurably longer than the no-op.
 *
 * Token is `signin:`-prefixed in VerificationToken so it doesn't
 * collide with email-verify tokens (no prefix) or password-reset
 * tokens (`pwreset:`).
 *
 * Tokens expire in 15 minutes. Single-use: deleted on consumption
 * by the magic-link Credentials provider in auth-config.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  const start = Date.now();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });

  // Only send a link to verified-email users. Unverified users (e.g., who
  // signed up with email/password but never clicked the verification link)
  // can't use magic-link signin — they need to verify first.
  if (user && user.emailVerified) {
    const token = generateToken();
    const expires = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    // Clear prior magic-link tokens so old links die. Email-verify tokens
    // (no prefix) and password-reset tokens (pwreset: prefix) are
    // unaffected.
    await prisma.verificationToken.deleteMany({
      where: { identifier: email, token: { startsWith: TOKEN_PREFIX } },
    });
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: TOKEN_PREFIX + token,
        expires,
      },
    });

    const signinUrl = buildSigninUrl(token, email);
    const tpl = magicLinkTemplate({ signinUrl, email, expiresMinutes: TOKEN_TTL_MINUTES });
    sendEmail({ to: email, ...tpl }).catch((err) =>
      console.error('[email-signin] email send failed', err),
    );
  }

  const elapsed = Date.now() - start;
  if (elapsed < SLOW_RESPONSE_MS) {
    await new Promise((r) => setTimeout(r, SLOW_RESPONSE_MS - elapsed));
  }

  return NextResponse.json({
    ok: true,
    message: 'If an account with that email exists, we sent a sign-in link.',
  });
}
