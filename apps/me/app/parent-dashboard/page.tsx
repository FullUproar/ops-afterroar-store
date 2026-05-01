import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { ChromeNav, PlayerCard, Workbench } from '@/app/components/card-shell';
import { TYPE, TitleBar } from '@/app/components/ui';

/**
 * Parent monitoring dashboard. Shows linked minor accounts with light-
 * touch activity oversight. Pro feature: requires parent to have an
 * active Pro/Connect subscription. Free parents who chose the one-time
 * consent fee path don't see this surface.
 *
 * Privacy posture: dashboard shows METADATA (event types, counterparty
 * names) but never message contents. Strong oversight (read-DM) would
 * be a separate explicit setting requiring kid acknowledgment, planned
 * for v2+.
 *
 * Kid sees a "Supervised by [parent]" badge on their own profile so
 * they know oversight is active. Transparency, not stealth.
 */
export default async function ParentDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/parent-dashboard');
  }

  const parent = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: {
      id: true,
      displayName: true,
      email: true,
      membershipTier: true,
    },
  });

  if (!parent) {
    redirect('/login');
  }

  const proActive = parent.membershipTier === 'PRO' || parent.membershipTier === 'CONNECT';

  // Fetch linked kids regardless of Pro state — non-Pro parents see the
  // upsell card prompting them to upgrade for monitoring.
  const kids = await prisma.user.findMany({
    where: { parentUserId: parent.id, isMinor: true },
    select: {
      id: true,
      email: true,
      displayName: true,
      passportCode: true,
      monitoringEnabled: true,
      accountStatus: true,
      parentVerifiedAt: true,
      createdAt: true,
      _count: {
        select: {
          activities: true,
          badges: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <>
      <ChromeNav signedIn email={parent.email} />
      <Workbench>
        <PlayerCard maxWidth="42rem">
          <TitleBar left="Parent Dashboard" />
          <div style={{ padding: '1.75rem var(--pad-x) 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h1
                style={{
                  ...TYPE.display,
                  fontSize: 'clamp(1.5rem, 5vw, 2rem)',
                  color: 'var(--cream)',
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                Your linked accounts
              </h1>
              <p style={{ ...TYPE.body, fontSize: '0.92rem', color: 'var(--ink-soft)', margin: '0.6rem 0 0', lineHeight: 1.55 }}>
                {kids.length === 0
                  ? "No linked minor accounts. When a teen sends you a consent request and you approve it, they'll appear here."
                  : proActive
                    ? "Identity-level activity for accounts you've consented to. Passport tracks where they sign in and what they do at the Passport layer; individual apps (HQ, etc.) hold their own data — we link to them where relevant."
                    : "Upgrade to Pro to see Passport-level activity for these accounts. Without Pro, your account remains linked for inform-path purposes only."}
              </p>
            </div>

            {!proActive && kids.length > 0 && (
              <div
                style={{
                  padding: '1.1rem 1.25rem',
                  background: 'rgba(255, 130, 0, 0.06)',
                  border: '1.5px solid rgba(255, 130, 0, 0.3)',
                  borderRadius: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                }}
              >
                <div style={{ ...TYPE.display, fontSize: '1rem', color: 'var(--orange)', fontWeight: 700 }}>
                  Upgrade to Pro to enable monitoring
                </div>
                <p style={{ ...TYPE.body, fontSize: '0.88rem', color: 'var(--ink-soft)', margin: 0, lineHeight: 1.55 }}>
                  $5/mo. See identity-level activity for your linked accounts: where they&apos;re using
                  their Passport, badges earned, store check-ins, and account alerts. Plus all your own
                  Pro perks.
                </p>
                <a
                  href="/billing/subscribe?tier=pro&return=/parent-dashboard"
                  style={{
                    alignSelf: 'flex-start',
                    padding: '0.55rem 1rem',
                    background: 'var(--orange)',
                    color: 'var(--void, #1a1a1a)',
                    ...TYPE.display,
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    borderRadius: '0.4rem',
                  }}
                >
                  Start Pro
                </a>
              </div>
            )}

            {kids.map((kid) => (
              <KidCard key={kid.id} kid={kid} proActive={proActive} />
            ))}

            {kids.length === 0 && (
              <div
                style={{
                  padding: '1.5rem',
                  textAlign: 'center',
                  background: 'var(--panel-mute)',
                  border: '1.5px dashed var(--rule)',
                  borderRadius: '0.75rem',
                }}
              >
                <p style={{ ...TYPE.body, color: 'var(--ink-soft)', margin: 0, fontSize: '0.9rem' }}>
                  Linked accounts will show up here.
                </p>
              </div>
            )}

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
              <strong style={{ color: 'var(--ink-soft)' }}>About this dashboard.</strong> Afterroar is
              the identity layer; the apps your kid uses (Game Night HQ, third-party apps, individual
              stores) are separate services with their own data. Passport shows where they&apos;re
              signed in and what they do at the identity layer. For oversight inside a specific app,
              engage with that app directly. If you need to reach us:{' '}
              <a href="mailto:afterroar@fulluproar.com" style={{ color: 'var(--orange)' }}>
                afterroar@fulluproar.com
              </a>
              . Full explainer on the{' '}
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

function KidCard({
  kid,
  proActive,
}: {
  kid: {
    id: string;
    email: string;
    displayName: string | null;
    passportCode: string | null;
    monitoringEnabled: boolean;
    accountStatus: string;
    parentVerifiedAt: Date | null;
    createdAt: Date;
    _count: { activities: number; badges: number };
  };
  proActive: boolean;
}) {
  return (
    <div
      style={{
        padding: '1.1rem 1.25rem',
        background: 'var(--panel-mute)',
        border: '1.5px solid var(--rule)',
        borderRadius: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...TYPE.display, fontSize: '1.05rem', color: 'var(--cream)', fontWeight: 700 }}>
            {kid.displayName || kid.email}
          </div>
          <div style={{ ...TYPE.body, fontSize: '0.78rem', color: 'var(--ink-faint)', marginTop: '0.15rem' }}>
            {kid.email} · linked {new Date(kid.parentVerifiedAt ?? kid.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div
          style={{
            padding: '0.25rem 0.6rem',
            background: kid.accountStatus === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(148, 163, 184, 0.1)',
            color: kid.accountStatus === 'active' ? '#10b981' : '#94a3b8',
            ...TYPE.display,
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            borderRadius: '0.3rem',
          }}
        >
          {kid.accountStatus}
        </div>
      </div>

      {proActive && kid.monitoringEnabled ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '0.5rem',
            marginTop: '0.25rem',
          }}
        >
          <Stat label="Activity events" value={kid._count.activities} />
          <Stat label="Badges earned" value={kid._count.badges} />
          <Stat label="Open alerts" value="0" hint="No unusual activity flagged" />
        </div>
      ) : (
        <p style={{ ...TYPE.body, fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0, lineHeight: 1.5 }}>
          Monitoring is off. {proActive ? 'Enable from settings.' : 'Upgrade to Pro to enable.'}
        </p>
      )}

      {proActive && kid.monitoringEnabled && (
        <a
          href={`/parent-dashboard/${kid.id}`}
          style={{
            alignSelf: 'flex-start',
            padding: '0.45rem 0.9rem',
            background: 'rgba(255, 130, 0, 0.1)',
            color: 'var(--orange)',
            border: '1px solid rgba(255, 130, 0, 0.4)',
            borderRadius: '0.4rem',
            ...TYPE.display,
            fontSize: '0.82rem',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          See activity
        </a>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div
      style={{
        padding: '0.6rem 0.7rem',
        background: 'rgba(0, 0, 0, 0.2)',
        border: '1px solid var(--rule)',
        borderRadius: '0.5rem',
      }}
    >
      <div style={{ ...TYPE.display, fontSize: '1.25rem', color: 'var(--cream)', fontWeight: 800, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ ...TYPE.body, fontSize: '0.7rem', color: 'var(--ink-faint)', marginTop: '0.25rem', letterSpacing: '0.04em' }}>
        {label}
      </div>
      {hint && (
        <div style={{ ...TYPE.body, fontSize: '0.7rem', color: 'var(--ink-faint)', marginTop: '0.15rem', fontStyle: 'italic' }}>
          {hint}
        </div>
      )}
    </div>
  );
}
