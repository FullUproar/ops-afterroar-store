import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

/**
 * Helper for writing CYA-grade user activity log rows. Critical security
 * + compliance events ONLY: auth, account lifecycle, consent, identity.
 * Not analytics. Not profile updates. Those come later when actually
 * needed.
 *
 * Why CYA matters now:
 * - Minor accounts + parental consent = identity-disputes-waiting-to-happen.
 *   "Did the parent consent on date X" must be answerable.
 * - Account takeover claims need a sign-in trail.
 * - DMCA / privacy / subpoena requests assume a complete activity record
 *   exists; building it after the first request is too late.
 * - Bans must be supportable with concrete evidence; arbitrary bans
 *   without evidence are a different liability.
 *
 * Schema: writes to existing UserActivity table on Passport DB. Fields
 * (`userId, action, targetType, targetId, metadata, createdAt`) are
 * sufficient for the CYA event set. ipAddress + userAgent live in the
 * `metadata` JSON field rather than columns.
 *
 * Privacy:
 * - IP captured; never display below admin-tier read access
 * - User-agent truncated at 256 chars (full UAs can fingerprint)
 * - No message contents, no draft text, no search queries
 * - Metadata schema is per-action; sensitive payloads MUST be omitted
 *
 * Best-effort: failures don't block the underlying action. Console.error
 * logs the gap for Vercel-side investigation.
 */

export type UserActivityAction =
  // Auth
  | 'auth.signin'
  | 'auth.signin_failure'
  | 'auth.signout'
  | 'auth.password_reset'
  | 'auth.magic_link_consume'
  | 'auth.oauth_link'
  | 'auth.oauth_unlink'
  | 'auth.email_verified'
  // Lifecycle (user-driven, distinct from admin-driven captured in
  // AdminAuditLog with action prefix 'user.')
  | 'lifecycle.account_create'
  | 'lifecycle.account_delete'
  // Consent
  | 'consent.parental_request_sent'
  | 'consent.parental_grant'
  | 'consent.parental_revoke'
  // Identity
  | 'identity.verified';

export interface UserActivityEntry {
  userId: string;
  action: UserActivityAction;
  targetType?: string;
  targetId?: number;
  metadata?: Record<string, unknown>;
}

const UA_TRUNCATE = 256;

export async function logUserActivity(entry: UserActivityEntry): Promise<void> {
  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
      const ua = h.get('user-agent');
      userAgent = ua ? ua.slice(0, UA_TRUNCATE) : null;
    } catch {
      // headers() throws when called outside a request context (e.g.,
      // from a NextAuth event handler in some scenarios). Fall back to
      // null IP/UA — better partial log than no log.
    }

    const metadata = {
      ...(entry.metadata ?? {}),
      ...(ip ? { ip } : {}),
      ...(userAgent ? { userAgent } : {}),
    };

    await prisma.userActivity.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        // UserActivity.metadata is a string column on this schema;
        // serialize to JSON for queryability via Prisma's string filters.
        metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
      },
    });
  } catch (err) {
    console.error('[user-activity] log write failed:', err);
  }
}
