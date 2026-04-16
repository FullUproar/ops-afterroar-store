import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { LayoutGrid, ArrowRight } from 'lucide-react';
import { PassportCard } from './passport-card';

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_LABEL = 'last 24h';
const MAX_RECENT_VISIBLE = 5;

export default async function PassportLanding() {
  const session = await auth();
  const userId = session?.user?.id;

  // Signed-out: marketing landing
  if (!userId) {
    return <SignedOut />;
  }

  // Signed-in: load Passport state in parallel.
  // Pull a generous slice of recent activity so we can apply the
  // 2-hour-window rule below without a second query.
  const [user, recentBadges, recentPoints] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId as string },
      select: { displayName: true, email: true, passportCode: true },
    }),
    prisma.userBadge.findMany({
      where: { userId: userId as string, revokedAt: null },
      include: { badge: { select: { name: true } } },
      orderBy: { issuedAt: 'desc' },
      take: 10,
    }),
    prisma.pointsLedger.findMany({
      where: { userId: userId as string },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, amount: true, description: true, createdAt: true, action: true },
    }),
  ]);

  // Recent activity rule:
  //  - inside RECENT_WINDOW_MS: show all events (cap MAX_RECENT_VISIBLE)
  //  - outside window: show the single most recent event (any age) so the
  //    section isn't empty for occasional users
  const allRecent = mergeRecent(recentBadges, recentPoints);
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  const inWindow = allRecent.filter((e) => e.when.getTime() >= cutoff);
  const visibleRecent = inWindow.length > 0
    ? inWindow.slice(0, MAX_RECENT_VISIBLE)
    : allRecent.slice(0, 1);
  const hasOverflow = inWindow.length > MAX_RECENT_VISIBLE;

  return (
    <main style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, rgba(255, 130, 0, 0.08), transparent 60%), #0a0a0a',
      padding: '2rem 1rem',
      display: 'flex',
      justifyContent: 'center',
    }}>
      <div style={{
        maxWidth: '32rem',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
      }}>
        {/* Greeting */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#FF8200', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', margin: 0 }}>
            Your Afterroar Passport
          </p>
          <h1 style={{ color: '#FBDB65', fontSize: '1.5rem', fontWeight: 900, margin: '0.35rem 0 0' }}>
            {user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'You'}
          </h1>
        </div>

        {/* Passport QR + code (the main event) */}
        {user?.passportCode ? (
          <PassportCard code={user.passportCode} />
        ) : (
          <div style={{
            padding: '1.25rem',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            color: '#fca5a5',
            fontSize: '0.85rem',
            textAlign: 'center',
            width: '100%',
          }}>
            Your Passport code hasn&apos;t been generated yet. Try signing out and back in, or contact support.
          </div>
        )}

        {/* Recent activity — see top of file for rule */}
        {visibleRecent.length > 0 && (
          <div style={{ width: '100%' }}>
            <p style={{ color: '#9ca3af', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 0.6rem' }}>
              Recent <span style={{ color: '#6b7280', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'none' }}>({RECENT_WINDOW_LABEL})</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {visibleRecent.map((item) => (
                <div key={item.key} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.65rem 0.85rem',
                  background: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </p>
                    {item.subtitle && (
                      <p style={{ margin: '0.1rem 0 0', color: '#6b7280', fontSize: '0.7rem' }}>
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                  <span style={{ color: '#6b7280', fontSize: '0.72rem', flexShrink: 0 }}>
                    {timeAgo(item.when)}
                  </span>
                </div>
              ))}
              {hasOverflow && (
                <Link href="/dashboard" style={{
                  padding: '0.55rem 0.85rem',
                  color: '#FF8200',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  textAlign: 'center',
                }}>
                  + {inWindow.length - MAX_RECENT_VISIBLE} more in dashboard
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Single primary action: Dashboard */}
        <Link href="/dashboard" style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.55rem',
          padding: '0.95rem 1.25rem',
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: '10px',
          color: '#e2e8f0',
          fontSize: '0.95rem',
          fontWeight: 700,
          textDecoration: 'none',
        }}>
          <LayoutGrid size={18} strokeWidth={2} />
          <span>Dashboard</span>
          <ArrowRight size={16} strokeWidth={2} style={{ marginLeft: '0.15rem', color: '#FF8200' }} />
        </Link>

        {/* Sign out + footer */}
        <div style={{
          marginTop: '0.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.75rem',
          color: '#6b7280',
        }}>
          <Link href="/api/auth/signout" style={{ color: '#6b7280', textDecoration: 'underline' }}>
            Sign out
          </Link>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Link href="/credo" style={{ color: '#FF8200', textDecoration: 'none', fontWeight: 600 }}>The Credo</Link>
            <Link href="/privacy" style={{ color: '#6b7280', textDecoration: 'none' }}>Privacy</Link>
            <Link href="/terms" style={{ color: '#6b7280', textDecoration: 'none' }}>Terms</Link>
          </div>
        </div>
      </div>
    </main>
  );
}

interface RecentItem {
  key: string;
  title: string;
  subtitle?: string;
  when: Date;
}

function mergeRecent(
  badges: Array<{ id: string; issuedAt: Date; badge: { name: string } }>,
  points: Array<{ id: string; amount: number; description: string; createdAt: Date; action: string }>,
): RecentItem[] {
  const items: RecentItem[] = [
    ...badges.map((b) => ({
      key: `b:${b.id}`,
      title: `Earned: ${b.badge.name}`,
      when: b.issuedAt,
    })),
    ...points.map((p) => ({
      key: `p:${p.id}`,
      title: `${p.amount >= 0 ? '+' : ''}${p.amount} pts · ${p.description}`,
      when: p.createdAt,
    })),
  ];
  items.sort((a, b) => b.when.getTime() - a.when.getTime());
  return items;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// ----- Signed-out marketing landing (unchanged from before) -----
function SignedOut() {
  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: '32rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, color: '#FF8200', margin: 0, letterSpacing: '-0.02em' }}>
          Afterroar
        </h1>
        <p style={{ fontSize: '1.25rem', color: '#e2e8f0', lineHeight: 1.6, margin: 0 }}>
          Your tabletop identity, your rules.
        </p>
        <p style={{ fontSize: '1rem', color: '#9ca3af', lineHeight: 1.6, margin: 0 }}>
          One login across every store and app in the Afterroar ecosystem.
          See your data. Control your consent. Delete anytime.
        </p>
        <Link href="/login" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: '0.875rem 2rem', background: '#FF8200', color: '#0a0a0a',
          fontWeight: 900, fontSize: '1rem', borderRadius: '8px', textDecoration: 'none',
        }}>
          Create your Passport
        </Link>
        <p style={{ fontSize: '0.9rem', color: '#9ca3af', margin: 0 }}>
          Already have one?{' '}
          <Link href="/login" style={{
            color: '#FBDB65', fontWeight: 700, textDecoration: 'underline',
            textDecorationColor: 'rgba(251, 219, 101, 0.4)', textUnderlineOffset: '3px',
          }}>
            Sign in
          </Link>
        </p>
        <div style={{
          marginTop: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: '0.5rem', fontSize: '0.75rem', color: '#6b7280',
        }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Link href="/credo" style={{ color: '#FF8200', textDecoration: 'none', fontWeight: 600 }}>The Credo</Link>
            <Link href="/privacy" style={{ color: '#6b7280', textDecoration: 'none' }}>Privacy</Link>
            <Link href="/terms" style={{ color: '#6b7280', textDecoration: 'none' }}>Terms</Link>
          </div>
          <span>Powered by Afterroar • Founded February 2025</span>
        </div>
      </div>
    </main>
  );
}
