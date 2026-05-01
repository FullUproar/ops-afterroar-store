import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  COOKIE_ADULT_ATTESTATION,
  adultAttestationCookieOptions,
  isUnder13Blocked,
} from '@/lib/age-gate';

/**
 * POST /api/auth/age-gate/attest-adult
 *
 * Called by the /signup page right before initiating Google OAuth. The
 * user has clicked the 18+ confirmation checkbox; we drop a short-lived
 * cookie so the OAuth signIn callback can verify the attestation
 * happened. The cookie expires in 10 minutes so a stale attestation
 * can't be reused later.
 *
 * Refuses if the device has the under-13 sticky cookie set — that block
 * is COPPA-required and not bypassable by a separate attestation.
 */
export async function POST() {
  if (await isUnder13Blocked()) {
    return NextResponse.json(
      { error: 'This account cannot be created on this device.' },
      { status: 403 },
    );
  }
  const store = await cookies();
  store.set(COOKIE_ADULT_ATTESTATION, '1', adultAttestationCookieOptions);
  return NextResponse.json({ ok: true });
}
