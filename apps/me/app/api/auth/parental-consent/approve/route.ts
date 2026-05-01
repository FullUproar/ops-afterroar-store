import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth-config';
import { sendEmail, verifyEmailTemplate } from '@/lib/email';
import { assignPassportCode } from '@/lib/passport-code';
import { parentalConsentRequired } from '@/lib/age-gate';
import { logUserActivity } from '@/lib/user-activity';

const VERIFY_TOKEN_TTL_HOURS = 24;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function buildVerifyUrl(token: string, email: string): string {
  const base =
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    'https://afterroar.me';
  const url = new URL('/verify-email', base);
  url.searchParams.set('token', token);
  url.searchParams.set('email', email);
  return url.toString();
}

/**
 * POST /api/auth/parental-consent/approve
 *
 * Body: { token: string, attestation?: string }
 *
 * Final step of the parental-consent flow. Validates:
 *   1. Token is pending and unexpired
 *   2. Caller is signed in as the parent matching the request's parentEmail
 *   3. Parent has identityVerified=true
 *   4. Parent has an active Pro (or Connect) subscription
 *
 * On success:
 *   - Create the child User row (or attach to an existing one matching the
 *     child's email, but only if it's already a minor account in
 *     pending_parent state — never overwrite an adult account).
 *   - Set parentUserId, parentVerifiedAt, isMinor=true,
 *     defaultVisibility="circle", accountStatus="active".
 *   - Generate a passportCode for the kid.
 *   - Mark the consent request completed.
 *   - Send the kid an email with a verification link so they can set
 *     their own password and sign in.
 */
export async function POST(request: NextRequest) {
  if (!parentalConsentRequired()) {
    return NextResponse.json(
      { error: 'Parental consent flow is currently disabled.' },
      { status: 400 },
    );
  }

  let body: { token?: string; attestation?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const token = String(body.token ?? '');
  const attestation = String(body.attestation ?? '').trim() || null;

  if (!token) {
    return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  }

  const consent = await prisma.minorConsentRequest.findUnique({ where: { token } });
  if (!consent) {
    return NextResponse.json({ error: 'Invalid token.' }, { status: 404 });
  }
  if (consent.status !== 'pending') {
    return NextResponse.json({ error: 'This request is no longer pending.' }, { status: 410 });
  }
  if (consent.expiresAt < new Date()) {
    await prisma.minorConsentRequest.update({
      where: { id: consent.id },
      data: { status: 'expired' },
    });
    return NextResponse.json({ error: 'This link expired.' }, { status: 410 });
  }

  const parent = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: {
      id: true,
      email: true,
      identityVerified: true,
      membershipTier: true,
      isMinor: true,
    },
  });

  if (!parent) {
    return NextResponse.json({ error: 'Parent account not found.' }, { status: 404 });
  }
  if (parent.email.toLowerCase() !== consent.parentEmail.toLowerCase()) {
    return NextResponse.json(
      { error: 'You are signed in as a different account than the consent email.' },
      { status: 403 },
    );
  }
  if (parent.isMinor) {
    return NextResponse.json({ error: 'Minors cannot grant consent.' }, { status: 403 });
  }
  if (!parent.identityVerified) {
    return NextResponse.json(
      { error: 'Identity verification required before granting consent.' },
      { status: 403 },
    );
  }
  // Either path satisfies the consent: $5 one-time consent fee paid OR
  // active Pro subscription. Pro adds the monitoring dashboard but is
  // not required for the kid account to exist.
  const proActive = parent.membershipTier === 'PRO' || parent.membershipTier === 'CONNECT';
  const consentFeePaid = !!consent.consentFeePaidAt;
  if (!proActive && !consentFeePaid) {
    return NextResponse.json(
      {
        error:
          'Choose a path: pay the one-time $5 consent fee or start a Pro subscription before activating.',
      },
      { status: 402 },
    );
  }

  // Find or create the child user. Only attach to an existing record if it
  // is already a pending minor account (never overwrite an adult).
  const existingChild = await prisma.user.findUnique({
    where: { email: consent.childEmail },
  });
  if (existingChild && (!existingChild.isMinor || existingChild.accountStatus === 'active')) {
    return NextResponse.json(
      { error: 'That email already belongs to an active account.' },
      { status: 409 },
    );
  }

  // monitoringEnabled = true only when parent is on Pro AND chose the Pro
  // path during consent. A parent who later upgrades to Pro can flip
  // monitoring on from settings (post-v1 work).
  const monitoringEnabled = proActive;

  const child = existingChild
    ? await prisma.user.update({
        where: { id: existingChild.id },
        data: {
          displayName: existingChild.displayName ?? consent.childDisplayName,
          dateOfBirth: consent.childDateOfBirth,
          isMinor: true,
          defaultVisibility: 'circle',
          parentUserId: parent.id,
          parentVerifiedAt: new Date(),
          accountStatus: 'active',
          monitoringEnabled,
        },
      })
    : await prisma.user.create({
        data: {
          email: consent.childEmail,
          displayName: consent.childDisplayName,
          dateOfBirth: consent.childDateOfBirth,
          isMinor: true,
          defaultVisibility: 'circle',
          parentUserId: parent.id,
          parentVerifiedAt: new Date(),
          accountStatus: 'active',
          monitoringEnabled,
        },
      });

  await assignPassportCode(child.id).catch((err) =>
    console.error('[parental-consent/approve] assignPassportCode failed', err),
  );

  await prisma.minorConsentRequest.update({
    where: { id: consent.id },
    data: {
      status: 'completed',
      completedAt: new Date(),
      childUserId: child.id,
      parentUserId: parent.id,
      attestationText: attestation,
      // Clear the DOB once the kid's User row holds it (we promised to
      // minimize PII on minors in the consent request table).
      childDateOfBirth: null,
    },
  });

  // Send the kid a verification email so they can set their password.
  // We never set a password on their behalf — they need to claim the
  // account themselves.
  const verifyToken = generateToken();
  const expires = new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  await prisma.verificationToken.deleteMany({ where: { identifier: child.email } });
  await prisma.verificationToken.create({
    data: { identifier: child.email, token: verifyToken, expires },
  });

  const verifyUrl = buildVerifyUrl(verifyToken, child.email);
  const tpl = verifyEmailTemplate(verifyUrl, child.displayName);
  sendEmail({ to: child.email, ...tpl }).catch((err) =>
    console.error('[parental-consent/approve] email send failed', err),
  );

  // CYA logs for the consent event. The grant is the load-bearing legal
  // moment: parent X consented for kid Y on date Z, this is the audit
  // trail. Logged on BOTH sides so each user's own activity log shows
  // the event from their perspective.
  await logUserActivity({
    userId: parent.id,
    action: 'consent.parental_grant',
    metadata: {
      childUserId: child.id,
      childEmail: child.email,
      consentRequestId: consent.id,
      pathChosen: proActive ? 'pro' : 'free_consent_fee',
    },
  });
  await logUserActivity({
    userId: child.id,
    action: 'lifecycle.account_create',
    metadata: {
      source: 'parental_consent',
      parentUserId: parent.id,
      consentRequestId: consent.id,
    },
  });

  return NextResponse.json({
    ok: true,
    childPassportCode: child.passportCode,
  });
}
