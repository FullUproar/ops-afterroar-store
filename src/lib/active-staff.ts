import { createHmac } from "crypto";
import { cookies } from "next/headers";

/* ------------------------------------------------------------------ */
/*  Active Staff Cookie                                                */
/*  HMAC-signed cookie for two-layer auth.                             */
/*  Layer 1: NextAuth session (device login)                           */
/*  Layer 2: This cookie (who is operating right now)                  */
/* ------------------------------------------------------------------ */

const COOKIE_NAME = "pos-active-staff";
const MAX_AGE = 24 * 60 * 60; // 24 hours

function getSecret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "fallback-dev-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function verify(payload: string, signature: string): boolean {
  const expected = sign(payload);
  return expected === signature;
}

export interface ActiveStaffPayload {
  staffId: string;
  storeId: string;
  ts: number;
}

export function encodeActiveStaff(staffId: string, storeId: string): string {
  const payload = `${staffId}:${storeId}:${Date.now()}`;
  const sig = sign(payload);
  return `${payload}:${sig}`;
}

export function decodeActiveStaff(token: string): ActiveStaffPayload | null {
  const parts = token.split(":");
  if (parts.length !== 4) return null;
  const [staffId, storeId, tsStr, sig] = parts;
  const payload = `${staffId}:${storeId}:${tsStr}`;
  if (!verify(payload, sig)) return null;

  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return null;

  // Check if expired (24 hours)
  if (Date.now() - ts > MAX_AGE * 1000) return null;

  return { staffId, storeId, ts };
}

/** Set the active staff cookie (server-side, in API route) */
export async function setActiveStaffCookie(staffId: string, storeId: string): Promise<void> {
  const token = encodeActiveStaff(staffId, storeId);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Clear the active staff cookie (server-side) */
export async function clearActiveStaffCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Read the active staff from the cookie (server-side) */
export async function getActiveStaffFromCookie(): Promise<ActiveStaffPayload | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return null;
  return decodeActiveStaff(cookie.value);
}
