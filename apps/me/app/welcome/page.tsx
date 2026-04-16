import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { BadgeIcon } from '@/app/components/badge-icon';
import { redirect } from 'next/navigation';
import Link from 'next/link';

/**
 * /welcome — first-time landing page for new Passport holders.
 *
 * Comes here after QR scan or SSO signup. Celebrates the new Passport,
 * shows the Pioneer badge they just earned, explains what this is.
 *
 * Query params:
 *   event — event slug (e.g., "pollock-party-2026") — issues event badge
 *   ref   — referrer (store, site, etc.) — logged for attribution
 */

interface WelcomePageProps {
  searchParams: Promise<{ event?: string; ref?: string }>;
}

async function issueBadgeBySlug(userId: string, slug: string, reason: string): Promise<{ name: string; emoji: string } | null> {
  const badge = await prisma.passportBadge.findUnique({ where: { slug } });
  if (!badge || badge.retiredAt) return null;
  if (badge.maxSupply && badge.totalIssued >= badge.maxSupply) return null;

  const existing = await prisma.userBadge.findUnique({
    where: { userId_badgeId: { userId, badgeId: badge.id } },
  });
  if (existing && !existing.revokedAt) {
    return { name: badge.name, emoji: badge.iconEmoji || '🏅' };
  }

  try {
    await prisma.$transaction([
      prisma.userBadge.upsert({
        where: { userId_badgeId: { userId, badgeId: badge.id } },
        create: { userId, badgeId: badge.id, issuedBy: 'afterroar', reason },
        update: { revokedAt: null },
      }),
      prisma.passportBadge.update({
        where: { id: badge.id },
        data: { totalIssued: { increment: 1 } },
      }),
    ]);
    return { name: badge.name, emoji: badge.iconEmoji || '🏅' };
  } catch {
    return null;
  }
}

// Backfill Pioneer for users who predate the badge seed (NextAuth createUser
// only fires for new sign-ins, so existing Full Uproar users never got it).
async function ensurePioneerBadge(userId: string): Promise<void> {
  await issueBadgeBySlug(userId, 'passport-pioneer', 'Early Passport adopter');
}

async function issueEventBadge(userId: string, eventSlug: string) {
  const badge = await prisma.passportBadge.findUnique({ where: { slug: eventSlug } });
  const reason = badge ? `Event: ${badge.name}` : `Event: ${eventSlug}`;
  return issueBadgeBySlug(userId, eventSlug, reason);
}

export default async function WelcomePage({ searchParams }: WelcomePageProps) {
  const params = await searchParams;
  const session = await auth();

  if (!session?.user?.id) {
    const event = params.event ? `?event=${encodeURIComponent(params.event)}` : '';
    redirect(`/login?callbackUrl=${encodeURIComponent(`/welcome${event}`)}`);
  }

  const userId = session.user.id;

  // Ensure Pioneer — covers users created before the badge was seeded
  await ensurePioneerBadge(userId);

  // If an event slug is provided, try to issue the event badge
  let eventBadge: { name: string; emoji: string } | null = null;
  if (params.event) {
    eventBadge = await issueEventBadge(userId, params.event);
  }

  // Get user's Passport code + all their badges
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      displayName: true,
      passportCode: true,
      createdAt: true,
    },
  });

  const userBadges = await prisma.userBadge.findMany({
    where: { userId, revokedAt: null },
    include: { badge: true },
    orderBy: { issuedAt: 'desc' },
    take: 10,
  });

  const firstName = user?.displayName?.split(' ')[0] || 'friend';

  // Is this a fresh Passport (signed up within the last minute)?
  const isFreshPassport = user?.createdAt && (Date.now() - user.createdAt.getTime() < 60_000);

  return (
    <main style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, rgba(255, 130, 0, 0.15), transparent 60%), #0a0a0a',
      padding: '3rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        maxWidth: '32rem',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
        alignItems: 'center',
        textAlign: 'center',
      }}>
        {/* Hero */}
        <div>
          <div style={{ fontSize: '4rem', lineHeight: 1, marginBottom: '1rem' }}>🧭</div>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 900,
            color: '#FF8200',
            margin: '0 0 0.5rem',
          }}>
            {isFreshPassport ? `Welcome, ${firstName}!` : `Hey again, ${firstName}!`}
          </h1>
          <p style={{ color: '#e2e8f0', fontSize: '1rem', margin: 0 }}>
            {isFreshPassport
              ? 'Your Afterroar Passport is live. Your tabletop identity, your data, your rules.'
              : 'Good to see you back. Here\'s where you stand.'}
          </p>
        </div>

        {/* Passport code */}
        {user?.passportCode && (
          <div style={{
            background: '#1f2937',
            border: '2px solid rgba(255, 130, 0, 0.3)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            width: '100%',
          }}>
            <p style={{ color: '#6b7280', fontSize: '0.75rem', margin: '0 0 0.25rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Your Passport Code
            </p>
            <p style={{ color: '#FF8200', fontSize: '2rem', fontWeight: 900, letterSpacing: '0.15em', margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {user.passportCode}
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.7rem', margin: '0.5rem 0 0' }}>
              Show this at participating stores so they know it&apos;s you.
            </p>
          </div>
        )}

        {/* Badges earned */}
        {userBadges.length > 0 && (
          <div style={{ width: '100%' }}>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
              {isFreshPassport ? 'You just earned:' : 'Your badges:'}
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: userBadges.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '0.75rem',
            }}>
              {userBadges.map((ub) => (
                <div key={ub.id} style={{
                  background: '#1f2937',
                  border: `1px solid ${ub.badge.color}44`,
                  borderRadius: '10px',
                  padding: '1rem 0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  <BadgeIcon
                    iconUrl={ub.badge.iconUrl}
                    iconEmoji={ub.badge.iconEmoji}
                    name={ub.badge.name}
                    size={64}
                    glowColor={ub.badge.color}
                  />
                  <p style={{ margin: 0, color: ub.badge.color, fontWeight: 700, fontSize: '0.85rem' }}>
                    {ub.badge.name}
                  </p>
                  {ub.badge.isLimited && (
                    <p style={{ color: '#6b7280', fontSize: '0.6rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Limited Edition
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* What's next */}
        <div style={{ width: '100%' }}>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>What now?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Link href="/library" style={linkStyle}>
              <span style={{ fontSize: '1.25rem' }}>📚</span>
              <div>
                <p style={linkTitle}>Add games to your library</p>
                <p style={linkDesc}>Snap a photo of your shelf — Fugly will read the boxes.</p>
              </div>
              <span style={arrowStyle}>→</span>
            </Link>
            <Link href="/wishlist" style={linkStyle}>
              <span style={{ fontSize: '1.25rem' }}>⭐</span>
              <div>
                <p style={linkTitle}>Build your wishlist</p>
                <p style={linkDesc}>Stores will see this (if you say so) when you walk in.</p>
              </div>
              <span style={arrowStyle}>→</span>
            </Link>
            <Link href="/loans" style={linkStyle}>
              <span style={{ fontSize: '1.25rem' }}>🤝</span>
              <div>
                <p style={linkTitle}>Track games you&apos;ve lent out</p>
                <p style={linkDesc}>Never forget who has your copy of Terraforming Mars again.</p>
              </div>
              <span style={arrowStyle}>→</span>
            </Link>
            <Link href="/settings" style={linkStyle}>
              <span style={{ fontSize: '1.25rem' }}>🎛️</span>
              <div>
                <p style={linkTitle}>Control what you share</p>
                <p style={linkDesc}>Every permission is off by default. You decide who sees what.</p>
              </div>
              <span style={arrowStyle}>→</span>
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #1f2937', paddingTop: '1.5rem', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <p style={{ color: '#6b7280', fontSize: '0.75rem', margin: 0, textAlign: 'center' }}>
            Your data belongs to you.{' '}
            <Link href="/credo" style={{ color: '#FF8200' }}>The Credo</Link>{' '}
            says so. And we mean it.
          </p>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
            <Link href="/" style={{ color: '#6b7280', textDecoration: 'none' }}>Home</Link>
            <Link href="/privacy" style={{ color: '#6b7280', textDecoration: 'none' }}>Privacy</Link>
            <Link href="/terms" style={{ color: '#6b7280', textDecoration: 'none' }}>Terms</Link>
          </div>
        </div>
      </div>
    </main>
  );
}

const linkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.85rem 1rem',
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: '10px',
  textDecoration: 'none',
  textAlign: 'left',
};

const linkTitle: React.CSSProperties = {
  margin: 0,
  color: '#e2e8f0',
  fontWeight: 600,
  fontSize: '0.9rem',
};

const linkDesc: React.CSSProperties = {
  margin: '0.15rem 0 0',
  color: '#6b7280',
  fontSize: '0.75rem',
};

const arrowStyle: React.CSSProperties = {
  marginLeft: 'auto',
  color: '#FF8200',
  fontSize: '1.25rem',
};
