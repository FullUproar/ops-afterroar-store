import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { ChromeNav, PlayerCard, Workbench } from '@/app/components/card-shell';
import { TYPE, TitleBar } from '@/app/components/ui';

interface PageProps {
  params: Promise<{ childId: string }>;
}

/**
 * Per-kid monitoring drilldown. Shows activity timeline, alerts, and
 * connections for one linked minor account. Pro-gated: free parents
 * see the upsell back at /parent-dashboard.
 *
 * Privacy posture: metadata only. We never expose kid's message
 * contents, draft text, or any private composition. The dashboard is
 * about "what's happening with my kid's account" not "let me read what
 * my kid is saying."
 */
export default async function ChildDrilldownPage({ params }: PageProps) {
  const { childId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/parent-dashboard/${childId}`);
  }

  const parent = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: { id: true, email: true, membershipTier: true },
  });
  if (!parent) redirect('/login');

  const proActive = parent.membershipTier === 'PRO' || parent.membershipTier === 'CONNECT';
  if (!proActive) redirect('/parent-dashboard');

  const kid = await prisma.user.findUnique({
    where: { id: childId },
    select: {
      id: true,
      email: true,
      displayName: true,
      passportCode: true,
      monitoringEnabled: true,
      accountStatus: true,
      parentUserId: true,
      isMinor: true,
    },
  });

  if (!kid || kid.parentUserId !== parent.id) notFound();
  if (!kid.monitoringEnabled) redirect('/parent-dashboard');

  const [activities, badges, alerts] = await Promise.all([
    prisma.userActivity.findMany({
      where: { userId: kid.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { id: true, action: true, targetType: true, targetId: true, metadata: true, createdAt: true },
    }),
    prisma.userBadge.findMany({
      where: { userId: kid.id, revokedAt: null },
      include: { badge: { select: { name: true, slug: true } } },
      orderBy: { issuedAt: 'desc' },
      take: 10,
    }),
    prisma.monitoredAlert.findMany({
      where: { parentUserId: parent.id, childUserId: kid.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return (
    <>
      <ChromeNav signedIn email={parent.email} />
      <Workbench>
        <PlayerCard maxWidth="42rem">
          <TitleBar left={kid.displayName || kid.email} />
          <div style={{ padding: '1.5rem var(--pad-x) 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <a
                href="/parent-dashboard"
                style={{ ...TYPE.body, fontSize: '0.82rem', color: 'var(--orange)', textDecoration: 'none' }}
              >
                ← All linked accounts
              </a>
              <h1
                style={{
                  ...TYPE.display,
                  fontSize: 'clamp(1.4rem, 4vw, 1.8rem)',
                  color: 'var(--cream)',
                  margin: '0.5rem 0 0',
                  lineHeight: 1.1,
                }}
              >
                {kid.displayName || kid.email}
              </h1>
              <p style={{ ...TYPE.body, fontSize: '0.85rem', color: 'var(--ink-faint)', margin: '0.3rem 0 0' }}>
                {kid.email} · {kid.passportCode || '—'}
              </p>
            </div>

            <Section title={`Alerts (${alerts.filter((a) => !a.readAt).length} unread)`}>
              {alerts.length === 0 ? (
                <Empty>No alerts. Quiet on the western front.</Empty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {alerts.map((a) => (
                    <AlertRow
                      key={a.id}
                      alertType={a.alertType}
                      payload={a.payload as Record<string, unknown>}
                      createdAt={a.createdAt}
                      unread={!a.readAt}
                    />
                  ))}
                </div>
              )}
            </Section>

            <Section title={`Recent activity${activities.length ? ` (last ${activities.length})` : ''}`}>
              {activities.length === 0 ? (
                <Empty>No activity yet. Stuff will show up here as they use Afterroar.</Empty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {activities.map((a) => (
                    <ActivityRow
                      key={a.id}
                      action={a.action}
                      targetType={a.targetType}
                      createdAt={a.createdAt}
                    />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Badges earned">
              {badges.length === 0 ? (
                <Empty>No badges yet.</Empty>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                  {badges.map((b) => (
                    <span
                      key={b.id}
                      style={{
                        padding: '0.3rem 0.7rem',
                        background: 'rgba(255, 130, 0, 0.1)',
                        color: 'var(--orange)',
                        border: '1px solid rgba(255, 130, 0, 0.3)',
                        borderRadius: '999px',
                        ...TYPE.body,
                        fontSize: '0.78rem',
                      }}
                    >
                      {b.badge.name}
                    </span>
                  ))}
                </div>
              )}
            </Section>

            <div style={{
              padding: '1rem 1.1rem',
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid var(--rule)',
              borderRadius: '0.6rem',
              ...TYPE.body,
              fontSize: '0.78rem',
              color: 'var(--ink-faint)',
              lineHeight: 1.55,
            }}>
              <strong style={{ color: 'var(--ink-soft)' }}>What this view shows:</strong> Passport-level
              activity only. Sign-ins, badges, store check-ins, and any alerts the apps your kid uses
              chose to surface to Passport. <strong style={{ color: 'var(--ink-soft)' }}>What it
              doesn&apos;t:</strong> activity inside Game Night HQ or any third-party app that uses
              Passport for sign-in. Those services hold their own data and may offer their own parental
              tools. Full explainer on the{' '}
              <a href="/parents" style={{ color: 'var(--orange)' }}>
                parent help page
              </a>
              .
            </div>
          </div>
        </PlayerCard>
      </Workbench>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ ...TYPE.display, fontSize: '1rem', color: 'var(--cream)', margin: '0 0 0.6rem', fontWeight: 700 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '0.85rem 1rem',
        background: 'var(--panel-mute)',
        border: '1px dashed var(--rule)',
        borderRadius: '0.5rem',
        ...TYPE.body,
        fontSize: '0.85rem',
        color: 'var(--ink-faint)',
        fontStyle: 'italic',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}

function AlertRow({
  alertType,
  payload,
  createdAt,
  unread,
}: {
  alertType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  unread: boolean;
}) {
  const summary = humanizeAlert(alertType, payload);
  return (
    <div
      style={{
        padding: '0.7rem 0.9rem',
        background: unread ? 'rgba(255, 130, 0, 0.06)' : 'var(--panel-mute)',
        border: `1px solid ${unread ? 'rgba(255, 130, 0, 0.3)' : 'var(--rule)'}`,
        borderRadius: '0.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        gap: '0.75rem',
        alignItems: 'center',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYPE.body, fontSize: '0.88rem', color: 'var(--cream)', fontWeight: 600 }}>{summary}</div>
        <div style={{ ...TYPE.body, fontSize: '0.74rem', color: 'var(--ink-faint)', marginTop: '0.15rem' }}>
          {createdAt.toLocaleString()}
        </div>
      </div>
      {unread && (
        <span
          style={{
            padding: '0.15rem 0.5rem',
            background: 'var(--orange)',
            color: 'var(--void, #1a1a1a)',
            ...TYPE.display,
            fontSize: '0.65rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            borderRadius: '0.3rem',
          }}
        >
          NEW
        </span>
      )}
    </div>
  );
}

function ActivityRow({
  action,
  targetType,
  createdAt,
}: {
  action: string;
  targetType: string | null;
  createdAt: Date;
}) {
  const display = humanizeActivity(action, targetType);
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: '0.75rem',
      padding: '0.55rem 0.75rem',
      background: 'rgba(0, 0, 0, 0.15)',
      borderRadius: '0.4rem',
      borderLeft: '3px solid var(--orange)',
    }}>
      <span style={{ ...TYPE.body, fontSize: '0.85rem', color: 'var(--ink-soft)' }}>{display}</span>
      <span style={{ ...TYPE.body, fontSize: '0.74rem', color: 'var(--ink-faint)', flexShrink: 0 }}>
        {createdAt.toLocaleDateString()}
      </span>
    </div>
  );
}

function humanizeAlert(type: string, payload: Record<string, unknown>): string {
  // Passport-level alerts (identity layer). Apps that want to surface
  // their own alerts to Passport push them via Connect-tier APIs in the
  // future; types coming from individual apps will be prefixed (e.g.,
  // 'hq:public_event_rsvp'). The dashboard renders an "from [app]" tag
  // when the alert type is prefixed, but the contents stay app-owned.
  switch (type) {
    case 'new_app_signin':
      return `Signed in to a new app: ${(payload.appName as string) || 'unknown'}`;
    case 'new_device_signin':
      return `Signed in from a new device`;
    case 'new_passport_connection': {
      const name = (payload.connectionName as string) || (payload.connectionEmail as string) || 'someone';
      return `Added Passport connection: ${name}`;
    }
    case 'identity_change':
      return `Account-level identity change`;
    default: {
      // App-prefixed alerts: e.g. 'hq:public_event_rsvp' renders as
      // "From HQ: public_event_rsvp" with the original payload. The
      // app's own page is the place for details.
      if (type.includes(':')) {
        const [app, rest] = type.split(':', 2);
        return `From ${app.toUpperCase()}: ${rest}`;
      }
      return `Activity: ${type}`;
    }
  }
}

function humanizeActivity(action: string, targetType: string | null): string {
  // Passport-level UserActivity actions. App-specific activity (RSVPs,
  // chats, etc.) lives in those apps and isn't surfaced here.
  const map: Record<string, string> = {
    login: 'Signed in to Passport',
    'badge.earn': 'Earned a badge',
    'profile.update': 'Updated profile',
    'store.checkin': 'Checked in at a store',
    'consent.grant': 'Granted a consent',
    'consent.revoke': 'Revoked a consent',
  };
  return map[action] || `${action}${targetType ? ` (${targetType})` : ''}`;
}
