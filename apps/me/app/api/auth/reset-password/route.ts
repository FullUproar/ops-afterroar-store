import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { logUserActivity } from '@/lib/user-activity';

const PASSWORD_MIN_LENGTH = 8;
const TOKEN_PREFIX = 'pwreset:';

/**
 * POST /api/auth/reset-password
 *
 * Body: { token: string, email: string, newPassword: string }
 *
 * Consumes a password-reset token. Validates:
 *   - Token exists in VerificationToken with the pwreset: prefix
 *   - Token is not expired
 *   - Email on the request matches the token's identifier
 *   - User exists with that email
 *
 * On success, updates User.passwordHash, deletes the token (single-use),
 * and clears any other pending reset tokens for the same email so an
 * attacker can't reuse a leaked link.
 */
export async function POST(request: NextRequest) {
  let body: { token?: string; email?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const token = String(body.token ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const newPassword = String(body.newPassword ?? '');

  if (!token || !email) {
    return NextResponse.json({ error: 'Token and email are required.' }, { status: 400 });
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const stored = await prisma.verificationToken.findUnique({
    where: { token: TOKEN_PREFIX + token },
  });
  if (!stored) {
    return NextResponse.json({ error: 'Invalid or already-used reset link.' }, { status: 404 });
  }
  if (stored.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { token: stored.token } });
    return NextResponse.json({ error: 'This reset link expired. Request a new one.' }, { status: 410 });
  }
  if (stored.identifier !== email) {
    return NextResponse.json({ error: 'Reset link does not match this email.' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: 'No account with that email.' }, { status: 404 });
  }

  const passwordHash = await hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  // Single-use: delete this token, plus any other pending reset tokens
  // for this email. Keeps email-verify tokens (different prefix) intact.
  await prisma.verificationToken.deleteMany({
    where: { identifier: email, token: { startsWith: TOKEN_PREFIX } },
  });

  // CYA log: password reset completed. Account-takeover-relevant event.
  await logUserActivity({
    userId: user.id,
    action: 'auth.password_reset',
  });

  return NextResponse.json({ ok: true });
}
