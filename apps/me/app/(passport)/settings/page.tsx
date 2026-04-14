import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

const CONSENT_LABELS: Record<string, { label: string; description: string }> = {
  platform_functional: {
    label: 'Platform essentials',
    description: 'Order confirmations, security alerts, password resets. Required for the platform to work.',
  },
  platform_product: {
    label: 'Platform updates',
    description: 'New features, improvements, and community content from Afterroar.',
  },
  game_night_functional: {
    label: 'Game night reminders',
    description: 'RSVP confirmations, day-of reminders, recap notifications for nights you joined.',
  },
  crew_activity: {
    label: 'Crew activity',
    description: 'Updates from your game groups — new nights planned, recap shares, friend activity.',
  },
  fulluproar_marketing: {
    label: 'Full Uproar marketing',
    description: 'New game releases, drops, and launches from Full Uproar Games. They built this platform but follow the same consent rules as everyone.',
  },
  fulluproar_personalization: {
    label: 'Full Uproar personalization',
    description: 'Personalized recommendations based on your purchases and library. "Because you bought X" type emails.',
  },
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  const [user, consents, userBadges] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        username: true,
        avatarUrl: true,
        passportCode: true,
        membershipTier: true,
        identityVerified: true,
        reputationScore: true,
        gameLibrary: true,
        createdAt: true,
      },
    }),
    prisma.userConsent.findMany({
      where: { userId },
      select: { category: true, granted: true, grantedAt: true, revokedAt: true, source: true },
      orderBy: { category: 'asc' },
    }),
    prisma.userBadge.findMany({
      where: { userId, revokedAt: null },
      include: { badge: true },
      orderBy: { issuedAt: 'desc' },
    }),
  ]);

  if (!user) redirect('/login');

  const consentMap = new Map(consents.map((c) => [c.category, c]));

  async function toggleConsent(formData: FormData) {
    'use server';
    const category = formData.get('category') as string;
    const currentlyGranted = formData.get('granted') === 'true';

    if (category === 'platform_functional') return; // Can't toggle functional

    await prisma.userConsent.upsert({
      where: { userId_category: { userId, category } },
      create: {
        userId,
        category,
        granted: !currentlyGranted,
        grantedAt: !currentlyGranted ? new Date() : null,
        revokedAt: currentlyGranted ? new Date() : null,
        source: 'passport_settings',
      },
      update: {
        granted: !currentlyGranted,
        grantedAt: !currentlyGranted ? new Date() : undefined,
        revokedAt: currentlyGranted ? new Date() : undefined,
      },
    });

    revalidatePath('/settings');
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#FF8200', marginBottom: '0.5rem' }}>
        Passport Settings
      </h1>
      <p style={{ color: '#9ca3af', marginBottom: '2rem' }}>
        Your data, your rules. See what Afterroar knows, control who can reach you, delete anything.
      </p>

      {/* Identity section */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '1rem' }}>
          Your identity
        </h2>
        <div style={{
          background: '#1f2937',
          borderRadius: '8px',
          padding: '1.25rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}>
          {[
            { label: 'Display name', value: user.displayName || '—' },
            { label: 'Username', value: user.username || '—' },
            { label: 'Email', value: user.email },
            { label: 'Passport code', value: user.passportCode || 'Not generated yet' },
            { label: 'Tier', value: user.membershipTier },
            { label: 'Verified', value: user.identityVerified ? 'Yes' : 'No' },
            { label: 'Reputation', value: String(user.reputationScore) },
            { label: 'Member since', value: user.createdAt.toLocaleDateString() },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ color: '#6b7280', fontSize: '0.75rem', margin: '0 0 0.25rem 0' }}>{label}</p>
              <p style={{ color: '#e2e8f0', fontSize: '0.9rem', margin: 0, fontWeight: 600 }}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Badges section */}
      {userBadges.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
            Your badges
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Identity markers you&apos;ve earned, received, or collected. Portable across every app that reads your Passport.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '0.75rem',
          }}>
            {userBadges.map((ub) => (
              <div key={ub.id} style={{
                background: '#1f2937',
                border: `1px solid ${ub.badge.color}33`,
                borderRadius: '10px',
                padding: '1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
              }}>
                <div style={{
                  fontSize: '2rem',
                  lineHeight: 1,
                  flexShrink: 0,
                  filter: `drop-shadow(0 0 12px ${ub.badge.color}44)`,
                }}>
                  {ub.badge.iconEmoji || '🏅'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: ub.badge.color }}>
                    {ub.badge.name}
                  </p>
                  <p style={{ margin: '0.2rem 0', fontSize: '0.7rem', color: '#6b7280' }}>
                    {ub.badge.description}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: '#4b5563' }}>
                    {ub.badge.issuerName || ub.badge.issuerType}
                    {ub.badge.isLimited && ' · limited'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Consent toggles */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          What Afterroar can talk to you about
        </h2>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Each toggle controls a specific category. Changes take effect immediately — no 10-day propagation delay.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {Object.entries(CONSENT_LABELS).map(([category, { label, description }]) => {
            const consent = consentMap.get(category);
            const granted = consent?.granted ?? (category === 'platform_functional');
            const isFunctional = category === 'platform_functional';

            return (
              <form key={category} action={toggleConsent} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.25rem',
                background: '#1f2937',
                borderRadius: '8px',
                border: `1px solid ${granted ? 'rgba(16, 185, 129, 0.3)' : '#374151'}`,
              }}>
                <input type="hidden" name="category" value={category} />
                <input type="hidden" name="granted" value={String(granted)} />
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#e2e8f0', fontWeight: 600, margin: '0 0 0.25rem 0', fontSize: '0.9rem' }}>
                    {label}
                  </p>
                  <p style={{ color: '#6b7280', margin: 0, fontSize: '0.8rem', lineHeight: 1.4 }}>
                    {description}
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isFunctional}
                  style={{
                    marginLeft: '1rem',
                    padding: '0.4rem 1rem',
                    borderRadius: '9999px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: isFunctional ? 'not-allowed' : 'pointer',
                    background: granted ? '#10b981' : '#374151',
                    color: granted ? '#fff' : '#9ca3af',
                    opacity: isFunctional ? 0.6 : 1,
                    minWidth: '3.5rem',
                  }}
                >
                  {granted ? 'On' : 'Off'}
                </button>
              </form>
            );
          })}
        </div>
      </section>

      {/* Data section */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          Your data
        </h2>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Everything Afterroar knows about you. You can export it all as JSON or delete specific categories.
        </p>

        <div style={{
          background: '#1f2937',
          borderRadius: '8px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}>
          {[
            { label: 'Game library', value: user.gameLibrary ? 'Has entries' : 'Empty' },
            { label: 'Consent grants', value: `${consents.length} categories tracked` },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>{label}</span>
              <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{value}</span>
            </div>
          ))}

          <div style={{ borderTop: '1px solid #374151', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
            <a
              href="/api/export-data"
              style={{
                color: '#FF8200',
                fontSize: '0.85rem',
                textDecoration: 'underline',
              }}
            >
              Export all my data as JSON
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div style={{ color: '#4b5563', fontSize: '0.75rem', textAlign: 'center', marginTop: '3rem' }}>
        Per the Afterroar Credo: your data belongs to you. See it, control it, delete it anytime.
      </div>
    </div>
  );
}
