/**
 * Shared age-gate utilities. Single source of truth for cohort math, cookie
 * names, and the parental-consent feature flag.
 *
 * COPPA technical requirement: when a user enters <13 in the neutral age
 * screen, we drop a long-lived cookie (UNDER_13_COOKIE) that prevents them
 * from simply hitting "back" and entering an older age. The FTC guidance
 * is explicit on this and Manus's research memo confirms it.
 *
 * Feature flag PARENTAL_CONSENT_REQUIRED defaults to true. When Shawn's
 * lawyer review clears the gate, flipping this to false drops 13-17
 * straight into the privacy-by-default cohort with no parent linkage.
 */

import { cookies } from 'next/headers';

export const COOKIE_AGE_GATE = 'afterroar_age_gate';
export const COOKIE_UNDER_13_BLOCK = 'afterroar_no_signup';
/**
 * Set when the user clicked "I confirm I'm 18 or older" on /signup. Used
 * by the OAuth signIn callback to allow Google signups for users who
 * never went through the DOB screen. Short-lived (10 minutes); just
 * enough to survive the round-trip to Google.
 */
export const COOKIE_ADULT_ATTESTATION = 'afterroar_adult_attest';

const ONE_YEAR = 60 * 60 * 24 * 365;
const ONE_HOUR = 60 * 60;

export type AgeCohort = 'under13' | 'teen' | 'adult';

export interface AgeGateResult {
  cohort: AgeCohort;
  age: number;
  isMinor: boolean;
}

/**
 * Compute age cohort from a date of birth. Used for routing decisions and
 * cookie payload.
 */
export function classifyAge(dateOfBirth: Date, now: Date = new Date()): AgeGateResult {
  const ageMs = now.getTime() - dateOfBirth.getTime();
  const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
  const age = Math.floor(ageYears);

  if (age < 13) return { cohort: 'under13', age, isMinor: true };
  if (age < 18) return { cohort: 'teen', age, isMinor: true };
  return { cohort: 'adult', age, isMinor: false };
}

/**
 * Validate a DOB input. Returns true if the input is well-formed and
 * represents a real (past) date.
 */
export function isValidDob(dob: Date): boolean {
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  if (dob > now) return false;
  // Reject anyone claiming > 120 years old, defensively.
  if (now.getFullYear() - dob.getFullYear() > 120) return false;
  return true;
}

/**
 * Cookie payload for the age gate. Stored as JSON in a signed httpOnly
 * cookie. Contains DOB so the downstream signup endpoints can persist it
 * without re-prompting.
 */
export interface AgeGatePayload {
  cohort: AgeCohort;
  dob: string;
  setAt: number;
}

/**
 * Read the age-gate cookie. Returns null if absent, malformed, or expired.
 */
export async function readAgeGateCookie(): Promise<AgeGatePayload | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_AGE_GATE)?.value;
  if (!raw) return null;
  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'));
    if (!decoded || typeof decoded !== 'object') return null;
    if (!decoded.cohort || !decoded.dob || !decoded.setAt) return null;
    // Cookie expires after 24 hours of inactivity at the form level
    if (Date.now() - decoded.setAt > 24 * 60 * 60 * 1000) return null;
    return decoded as AgeGatePayload;
  } catch {
    return null;
  }
}

/**
 * Read the "<13 blocked" cookie. If present, the visitor cannot retry the
 * age gate. We honor this even if they clear localStorage; the cookie is
 * the ground truth for the COPPA-required retry-prevention.
 */
export async function isUnder13Blocked(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE_UNDER_13_BLOCK)?.value === '1';
}

/**
 * Read the adult-attestation cookie. Indicates the user clicked the
 * 18+ confirmation checkbox on /signup before initiating OAuth.
 */
export async function hasAdultAttestation(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE_ADULT_ATTESTATION)?.value === '1';
}

/**
 * Build the value for the age-gate cookie. Caller sets it via
 * `cookies().set(COOKIE_AGE_GATE, ...)`. Uses base64url-encoded JSON.
 *
 * NOTE: This is not cryptographically signed. A determined user could
 * forge an adult cookie, but the same user could just lie about their DOB
 * directly. Self-attestation is the legal bar; we're not preventing fraud,
 * we're collecting an honest answer with a paper trail.
 */
export function encodeAgeGatePayload(payload: AgeGatePayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
}

export const ageGateCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: ONE_HOUR * 6, // 6 hours: enough for a multi-step signup flow
};

export const under13CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: ONE_YEAR,
};

export const adultAttestationCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  // 10 minutes: long enough for an OAuth round-trip, short enough that
  // a stale attestation can't be reused days later.
  maxAge: 60 * 10,
};

/**
 * Feature flag: parental consent currently required for 13-17 cohort.
 * When false, 13-17 signups bypass the parent-magic-link flow and go
 * straight into a privacy-defaulted minor account.
 *
 * Defaults to true (the safer state). Flip via env var
 * PARENTAL_CONSENT_REQUIRED=false in Vercel after legal review.
 */
export function parentalConsentRequired(): boolean {
  const v = process.env.PARENTAL_CONSENT_REQUIRED;
  if (!v) return true;
  return v.toLowerCase() !== 'false';
}
