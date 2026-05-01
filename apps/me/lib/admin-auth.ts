import { auth } from '@/lib/auth-config';
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';

/**
 * Simple admin allowlist via env var. Comma-separated list of emails.
 *
 *   ADMIN_EMAILS=shawnoah.pollock@gmail.com,info@fulluproar.com
 *
 * Per `feedback_credo_interpretation.md`: a platform super-admin role
 * for running the platform itself is fine; what the Credo prohibits is
 * preferential commercial/data access. Admin tooling for ops use is
 * the former, not the latter.
 *
 * Future hardening: move to a User.role field with multi-tier RBAC
 * once the network outgrows a 2-3 person admin team. For now, env-list
 * is sufficient and avoids schema lock-in before the access patterns
 * settle.
 */

function adminEmailSet(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type AdminCheckResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'not_signed_in' }
  | { ok: false; reason: 'env_missing'; userEmail: string }
  | { ok: false; reason: 'not_on_allowlist'; userEmail: string };

export async function checkAdmin(): Promise<AdminCheckResult> {
  // The auth() return type collapses to NextMiddleware in some
  // contexts due to overload inference; the runtime value is always
  // Session | null when invoked without arguments. Cast accordingly.
  const session = (await auth()) as Session | null;
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ok: false, reason: 'not_signed_in' };

  const allowlist = adminEmailSet();
  if (allowlist.size === 0) {
    return { ok: false, reason: 'env_missing', userEmail: email };
  }
  if (!allowlist.has(email)) {
    return { ok: false, reason: 'not_on_allowlist', userEmail: email };
  }
  // session is non-null here because we returned early on missing email
  return { ok: true, session: session as Session };
}

export async function getAdminSession(): Promise<Session | null> {
  const result = await checkAdmin();
  return result.ok ? result.session : null;
}

export async function requireAdmin(): Promise<Session> {
  const result = await checkAdmin();
  if (result.ok) return result.session;

  // Log specifically which path failed so Vercel logs make first-time
  // setup debuggable instead of presenting a silent redirect to /login.
  if (result.reason === 'env_missing') {
    console.warn(
      `[admin-auth] /admin access refused: ADMIN_EMAILS env var is empty or unset. ` +
      `User attempting access: ${result.userEmail}. ` +
      `Set ADMIN_EMAILS in Vercel project env to a comma-separated allowlist.`,
    );
  } else if (result.reason === 'not_on_allowlist') {
    console.warn(
      `[admin-auth] /admin access refused: ${result.userEmail} not on ADMIN_EMAILS allowlist.`,
    );
  }

  if (result.reason === 'not_signed_in') {
    redirect('/login?callbackUrl=/admin/users');
  }
  // Signed in but not authorized: render the not-authorized page,
  // don't bounce to login. The user IS signed in; the bounce loop is
  // unhelpful and confusing.
  redirect('/admin/not-authorized');
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmailSet().has(email.toLowerCase());
}
