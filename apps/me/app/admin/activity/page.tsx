import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { ChromeNav, Workbench, PlayerCard } from '@/app/components/card-shell';
import { TYPE, TitleBar } from '@/app/components/ui';

interface PageProps {
  searchParams: Promise<{
    userId?: string;
    userEmail?: string;
    action?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'muted' | 'purple' }> = {
  'auth.signin': { label: 'Sign in', tone: 'green' },
  'auth.signin_failure': { label: 'Sign-in failure', tone: 'red' },
  'auth.signout': { label: 'Sign out', tone: 'muted' },
  'auth.password_reset': { label: 'Password reset', tone: 'amber' },
  'auth.magic_link_consume': { label: 'Magic link signin', tone: 'blue' },
  'auth.oauth_link': { label: 'Linked OAuth', tone: 'blue' },
  'auth.oauth_unlink': { label: 'Unlinked OAuth', tone: 'amber' },
  'auth.email_verified': { label: 'Email verified', tone: 'green' },
  'lifecycle.account_create': { label: 'Account created', tone: 'green' },
  'lifecycle.account_delete': { label: 'Account deleted', tone: 'red' },
  'consent.parental_request_sent': { label: 'Consent request sent', tone: 'amber' },
  'consent.parental_grant': { label: 'Parental consent granted', tone: 'purple' },
  'consent.parental_revoke': { label: 'Parental consent revoked', tone: 'red' },
  'identity.verified': { label: 'Identity verified', tone: 'blue' },
};

export default async function ActivityLogPage({ searchParams }: PageProps) {
  const session = await requireAdmin();
  const params = await searchParams;
  const userIdParam = params.userId || '';
  const userEmail = params.userEmail || '';
  const action = params.action || '';
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);

  // Resolve userEmail → userId (priority: explicit userId param wins).
  let resolvedUserId = userIdParam;
  if (!resolvedUserId && userEmail) {
    const u = await prisma.user.findUnique({
      where: { email: userEmail.toLowerCase() },
      select: { id: true },
    });
    if (u) resolvedUserId = u.id;
  }

  const where: Record<string, unknown> = {};
  if (resolvedUserId) where.userId = resolvedUserId;
  if (action) where.action = action;

  const [rows, total] = await Promise.all([
    prisma.userActivity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        userId: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true,
        user: { select: { email: true, displayName: true } },
      },
    }),
    prisma.userActivity.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <ChromeNav signedIn email={session.user?.email} />
      <Workbench>
        <PlayerCard maxWidth="64rem">
          <TitleBar left="Admin · Activity Log" right={`signed in as ${session.user?.email}`} />
          <div style={{ padding: '1.5rem var(--pad-x) 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link href="/admin/users" style={navLinkStyle}>← Users</Link>
              <Link href="/admin/audit" style={navLinkStyle}>Admin audit log →</Link>
              <span style={{ ...TYPE.body, fontSize: '0.82rem', color: 'var(--ink-faint)', alignSelf: 'center' }}>
                CYA-grade user activity: auth, lifecycle, consent, identity. Not analytics.
              </span>
            </div>

            <form
              method="get"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                alignItems: 'center',
              }}
            >
              <input name="userEmail" type="search" defaultValue={userEmail} placeholder="Filter by user email" style={inputStyle} />
              <select name="action" defaultValue={action} style={inputStyle}>
                <option value="">All actions</option>
                {Object.entries(ACTION_LABELS).map(([code, meta]) => (
                  <option key={code} value={code}>{meta.label}</option>
                ))}
              </select>
              <button
                type="submit"
                style={{
                  padding: '0.55rem 1rem',
                  background: 'var(--orange)',
                  border: 'none',
                  color: 'var(--void, #1a1a1a)',
                  ...TYPE.display,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  borderRadius: '0.4rem',
                }}
              >
                Apply
              </button>
            </form>

            <div style={{ ...TYPE.body, fontSize: '0.8rem', color: 'var(--ink-faint)' }}>
              {total === 0
                ? userEmail && !resolvedUserId
                  ? `No user with email "${userEmail}" found.`
                  : 'No activity matches.'
                : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
            </div>

            {rows.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', ...TYPE.body, fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid var(--rule)', textAlign: 'left' }}>
                      <Th>When</Th>
                      <Th>User</Th>
                      <Th>Action</Th>
                      <Th>Detail</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const meta = ACTION_LABELS[r.action] || { label: r.action, tone: 'muted' as const };
                      const md = parseMetadata(r.metadata);
                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--rule)', verticalAlign: 'top' }}>
                          <Td>
                            <div style={{ ...TYPE.body, fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                              {r.createdAt.toLocaleString()}
                            </div>
                            {md?.ip ? (
                              <div style={{ ...TYPE.mono, fontSize: '0.7rem', color: 'var(--ink-faint)', marginTop: '0.15rem' }}>
                                {String(md.ip)}
                              </div>
                            ) : null}
                          </Td>
                          <Td>
                            <Link
                              href={`/admin/users/${r.userId}`}
                              style={{ color: 'var(--cream)', fontWeight: 600, textDecoration: 'none' }}
                            >
                              {r.user.email}
                            </Link>
                            {r.user.displayName && (
                              <div style={{ color: 'var(--ink-faint)', fontSize: '0.72rem' }}>
                                {r.user.displayName}
                              </div>
                            )}
                          </Td>
                          <Td>
                            <Pill label={meta.label} tone={meta.tone} />
                          </Td>
                          <Td>
                            {md ? (
                              <div style={{ ...TYPE.mono, fontSize: '0.7rem', color: 'var(--ink-soft)', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                {Object.entries(md)
                                  .filter(([k]) => k !== 'ip' && k !== 'userAgent')
                                  .map(([k, v]) => (
                                    <div key={k}>
                                      <span style={{ color: 'var(--ink-faint)' }}>{k}: </span>
                                      <span>{stringify(v)}</span>
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--ink-faint)' }}>—</span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                <PageLink page={page - 1} disabled={page === 1} userId={userIdParam} userEmail={userEmail} action={action} label="←" />
                <span style={{ ...TYPE.body, fontSize: '0.85rem', color: 'var(--ink-soft)', alignSelf: 'center' }}>
                  Page {page} of {totalPages}
                </span>
                <PageLink page={page + 1} disabled={page === totalPages} userId={userIdParam} userEmail={userEmail} action={action} label="→" />
              </div>
            )}
          </div>
        </PlayerCard>
      </Workbench>
    </>
  );
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: '0.5rem 0.6rem', ...TYPE.body, fontSize: '0.72rem', color: 'var(--ink-soft)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '0.6rem', verticalAlign: 'top' }}>{children}</td>;
}

function Pill({ label, tone }: { label: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'muted' | 'purple' }) {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    green: { bg: 'rgba(16, 185, 129, 0.1)', fg: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
    amber: { bg: 'rgba(251, 191, 36, 0.1)', fg: '#fbbf24', border: 'rgba(251, 191, 36, 0.3)' },
    red: { bg: 'rgba(239, 68, 68, 0.1)', fg: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
    blue: { bg: 'rgba(59, 130, 246, 0.1)', fg: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
    muted: { bg: 'rgba(148, 163, 184, 0.1)', fg: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' },
    purple: { bg: 'rgba(168, 85, 247, 0.1)', fg: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' },
  };
  const c = palette[tone];
  return (
    <span style={{ padding: '0.15rem 0.5rem', background: c.bg, color: c.fg, border: `1px solid ${c.border}`, borderRadius: '0.3rem', ...TYPE.body, fontSize: '0.7rem', fontWeight: 700 }}>
      {label}
    </span>
  );
}

function PageLink({
  page,
  disabled,
  userId,
  userEmail,
  action,
  label,
}: {
  page: number;
  disabled: boolean;
  userId: string;
  userEmail: string;
  action: string;
  label: string;
}) {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (userEmail) params.set('userEmail', userEmail);
  if (action) params.set('action', action);
  params.set('page', String(page));
  if (disabled) {
    return <span style={{ padding: '0.4rem 0.8rem', color: 'var(--ink-faint)', ...TYPE.display, fontSize: '0.85rem' }}>{label}</span>;
  }
  return (
    <Link
      href={`/admin/activity?${params.toString()}`}
      style={{ padding: '0.4rem 0.8rem', background: 'var(--panel-mute)', border: '1px solid var(--rule)', borderRadius: '0.3rem', color: 'var(--cream)', textDecoration: 'none', ...TYPE.display, fontSize: '0.85rem' }}
    >
      {label}
    </Link>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.55rem 0.8rem',
  background: 'var(--panel-mute)',
  border: '1.5px solid var(--rule)',
  color: 'var(--cream)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.9rem',
  outline: 'none',
  borderRadius: '0.4rem',
};

const navLinkStyle: React.CSSProperties = {
  padding: '0.4rem 0.85rem',
  background: 'var(--panel-mute)',
  border: '1px solid var(--rule)',
  borderRadius: '0.4rem',
  color: 'var(--orange)',
  ...TYPE.body,
  fontSize: '0.82rem',
  textDecoration: 'none',
};
