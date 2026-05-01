import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { assignPassportCode } from '@/lib/passport-code';
import Link from 'next/link';
import { LayoutGrid, ArrowRight } from 'lucide-react';
import { PassportCard } from './passport-card';
import { ChromeNav, Workbench, PlayerCard } from './components/card-shell';
import { TitleBar, TYPE, Button } from './components/ui';

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_LABEL = 'last 24h';
const MAX_RECENT_VISIBLE = 5;

export default async function PassportLanding() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) return <SignedOut />;

  let [user, recentBadges, recentPoints] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId as string },
      select: {
        displayName: true,
        email: true,
        passportCode: true,
        isMinor: true,
        monitoringEnabled: true,
        parent: { select: { displayName: true, email: true } },
      },
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

  // Self-heal: NextAuth v5's events.createUser is fire-and-forget, so the
  // OAuth callback can redirect here before the passportCode write lands.
  // The previous "sign out and back in" advice didn't work because the
  // event only fires on user creation, not subsequent sign-ins, leaving
  // the orphaned user permanently codeless. Generate inline if missing.
  if (user && !user.passportCode) {
    await assignPassportCode(userId as string).catch((err) => {
      console.error('[passport landing] self-heal failed:', err);
    });
    user = await prisma.user.findUnique({
      where: { id: userId as string },
      select: {
        displayName: true,
        email: true,
        passportCode: true,
        isMinor: true,
        monitoringEnabled: true,
        parent: { select: { displayName: true, email: true } },
      },
    });
  }

  const allRecent = mergeRecent(recentBadges, recentPoints);
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  const inWindow = allRecent.filter((e) => e.when.getTime() >= cutoff);
  const visibleRecent = inWindow.length > 0
    ? inWindow.slice(0, MAX_RECENT_VISIBLE)
    : allRecent.slice(0, 1);
  const hasOverflow = inWindow.length > MAX_RECENT_VISIBLE;

  const first = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'You';

  return (
    <>
      <ChromeNav email={session?.user?.email} />
      <Workbench>
        <PlayerCard maxWidth="32rem">
          <TitleBar left="Your Passport" right={user?.passportCode ? `FU · ${user.passportCode}` : undefined} />

          <div style={{
            padding: '1.5rem var(--pad-x) 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
          }}>
            {/* Greeting */}
            <div style={{ textAlign: 'center' }}>
              <p style={{ ...TYPE.mono, color: 'var(--orange)', fontSize: '0.62rem', letterSpacing: '0.3em', textTransform: 'uppercase', margin: 0, fontWeight: 700 }}>
                Afterroar Passport
              </p>
              <h1 style={{ ...TYPE.display, color: 'var(--cream)', fontSize: 'clamp(1.5rem, 6vw, 2.2rem)', margin: '0.4rem 0 0', lineHeight: 1 }}>
                {first}
              </h1>
            </div>

            {/* Supervised-by badge for minor accounts whose parent has Pro
                + monitoring enabled. Transparency-by-design: kid sees this
                on their own page so they know oversight is on. NOT a stealth
                surveillance pattern. */}
            {user?.isMinor && user?.monitoringEnabled && user?.parent && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.6rem 0.85rem',
                  background: 'rgba(255, 130, 0, 0.08)',
                  border: '1px solid rgba(255, 130, 0, 0.3)',
                  borderRadius: '0.5rem',
                  width: '100%',
                  maxWidth: '22rem',
                }}
              >
                <div
                  style={{
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: '50%',
                    background: 'rgba(255, 130, 0, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.85rem',
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  🛡
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...TYPE.mono, color: 'var(--orange)', fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>
                    Supervised account
                  </div>
                  <div style={{ ...TYPE.body, fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: '0.1rem', lineHeight: 1.4 }}>
                    {user.parent.displayName || user.parent.email} can see your Passport activity (apps you sign into, badges earned, check-ins). Activity inside the apps themselves stays inside those apps.
                  </div>
                </div>
              </div>
            )}

            {/* QR card — the main event */}
            {user?.passportCode ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                <PassportCard code={user.passportCode} />
                <p style={{
                  ...TYPE.mono,
                  fontSize: '0.62rem',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-faint)',
                  fontWeight: 600,
                  textAlign: 'center',
                  margin: 0,
                  maxWidth: '22ch',
                  lineHeight: 1.5,
                }}>
                  Show this at Afterroar stores to check in &amp; earn points
                </p>
              </div>
            ) : (
              <div style={{
                padding: '1rem',
                background: 'rgba(196, 77, 77, 0.08)',
                border: '1px solid rgba(196, 77, 77, 0.3)',
                color: 'var(--red)',
                ...TYPE.body,
                fontSize: '0.85rem',
                textAlign: 'center',
                width: '100%',
              }}>
                We couldn&apos;t generate your Passport code. Refresh the page; if it sticks, contact support.
              </div>
            )}

            {/* Recent activity */}
            {visibleRecent.length > 0 ? (
              <div style={{ width: '100%' }}>
                <p style={{ ...TYPE.mono, color: 'var(--ink-soft)', fontSize: '0.6rem', letterSpacing: '0.25em', textTransform: 'uppercase', margin: '0 0 0.55rem', fontWeight: 700 }}>
                  Recent <span style={{ color: 'var(--ink-faint)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'none' }}>({RECENT_WINDOW_LABEL})</span>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--rule)', border: '1px solid var(--rule)' }}>
                  {visibleRecent.map((item) => (
                    <div key={item.key} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      padding: '0.6rem 0.85rem',
                      background: 'var(--panel-mute)',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ ...TYPE.body, margin: 0, color: 'var(--cream)', fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </p>
                      </div>
                      <span style={{ ...TYPE.mono, color: 'var(--ink-faint)', fontSize: '0.68rem', flexShrink: 0, letterSpacing: '0.04em' }}>
                        {timeAgo(item.when)}
                      </span>
                    </div>
                  ))}
                  {hasOverflow ? (
                    <Link href="/dashboard" style={{
                      padding: '0.55rem 0.85rem',
                      background: 'var(--panel-mute)',
                      color: 'var(--orange)',
                      ...TYPE.mono,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                      textDecoration: 'none',
                      textAlign: 'center',
                    }}>
                      + {inWindow.length - MAX_RECENT_VISIBLE} more in dashboard
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : (
              // Empty-state — no activity yet. Show clear next-actions
              // (action-forward, not fake-data-forward — earlier version
              // mixed a preview column with an action label which read
              // ambiguously). Alive Rule with honest content.
              <div style={{ width: '100%' }}>
                <p style={{ ...TYPE.mono, color: 'var(--ink-soft)', fontSize: '0.6rem', letterSpacing: '0.25em', textTransform: 'uppercase', margin: '0 0 0.55rem', fontWeight: 700 }}>
                  Get started
                </p>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  border: '1px dashed var(--rule-hi)',
                  padding: '0.85rem 0.95rem',
                  gap: '0.65rem',
                  background: 'rgba(255, 255, 255, 0.015)',
                }}>
                  {[
                    'Check in at your local game store',
                    'Add games to your library',
                    'Earn your first badge',
                  ].map((line) => (
                    <div key={line} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                    }}>
                      <span style={{
                        color: 'var(--orange)',
                        fontSize: '0.85rem',
                        flexShrink: 0,
                        fontWeight: 700,
                        lineHeight: 1,
                      }}>
                        →
                      </span>
                      <p style={{ ...TYPE.body, margin: 0, color: 'var(--cream)', fontSize: '0.85rem', opacity: 0.85 }}>
                        {line}
                      </p>
                    </div>
                  ))}
                </div>
                <p style={{ ...TYPE.mono, color: 'var(--ink-faint)', fontSize: '0.6rem', letterSpacing: '0.06em', textAlign: 'center', margin: '0.55rem 0 0' }}>
                  Your activity shows up here as you play
                </p>
              </div>
            )}

            {/* Primary action: Dashboard */}
            <Button href="/dashboard">
              <LayoutGrid size={16} strokeWidth={2} /> Dashboard <ArrowRight size={14} strokeWidth={2} />
            </Button>
          </div>

          <footer style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.9rem',
            padding: '0.9rem var(--pad-x)',
            borderTop: '1px solid var(--rule)',
            ...TYPE.mono,
            fontSize: '0.62rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}>
            <Link href="/passport-101" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>What is this?</Link>
            <Link href="/credo" style={{ color: 'var(--orange)', textDecoration: 'none' }}>The Credo</Link>
            <Link href="/privacy" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Privacy</Link>
            <Link href="/terms" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Terms</Link>
            <Link href="/api/auth/signout" style={{ color: 'var(--ink-faint)', textDecoration: 'none' }}>Sign out</Link>
          </footer>
        </PlayerCard>
      </Workbench>
    </>
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
    ...badges.map((b) => ({ key: `b:${b.id}`, title: `Earned: ${b.badge.name}`, when: b.issuedAt })),
    ...points.map((p) => ({ key: `p:${p.id}`, title: `${p.amount >= 0 ? '+' : ''}${p.amount} pts · ${p.description}`, when: p.createdAt })),
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

// ===== Signed-out marketing landing =====
function SignedOut() {
  return (
    <>
      <ChromeNav signedIn={false} />
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 3rem)',
        padding: '3rem 1.5rem',
        background: 'radial-gradient(ellipse at top, rgba(255, 130, 0, 0.15), transparent 60%), var(--void)',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: '32rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
          <p style={{ ...TYPE.mono, color: 'var(--orange)', fontSize: '0.72rem', letterSpacing: '0.32em', textTransform: 'uppercase', margin: 0, fontWeight: 700 }}>
            Afterroar · Issue 01
          </p>
          <h1 style={{
            ...TYPE.display,
            fontSize: 'clamp(2.5rem, 9vw, 4.5rem)',
            color: 'var(--cream)',
            margin: 0,
            letterSpacing: '-0.03em',
            lineHeight: 0.95,
          }}>
            Your tabletop<br />identity, <span style={{ color: 'var(--orange)' }}>your rules.</span>
          </h1>
          <p style={{ ...TYPE.body, fontSize: '1.05rem', color: 'var(--ink)', margin: 0, lineHeight: 1.6, maxWidth: '36ch' }}>
            One login across every store and app in the Afterroar ecosystem.
            See your data. Control your consent. Delete anytime.
          </p>
          <Button href="/signup">Create your Passport</Button>
          <p style={{ ...TYPE.mono, color: 'var(--ink-soft)', fontSize: '0.72rem', margin: 0, letterSpacing: '0.08em' }}>
            Already have one?{' '}
            <Link href="/login" style={{ color: 'var(--yellow)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px' }}>
              Sign in
            </Link>
          </p>
          <p style={{ ...TYPE.mono, color: 'var(--ink-faint)', fontSize: '0.7rem', margin: 0, letterSpacing: '0.08em' }}>
            Own a game store?{' '}
            <Link href="/store" style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 600 }}>
              Learn about Connect →
            </Link>
          </p>
          <div style={{
            marginTop: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
            ...TYPE.mono,
            fontSize: '0.66rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
          }}>
            <div style={{ display: 'flex', gap: '1.1rem' }}>
              <Link href="/credo" style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 600 }}>The Credo</Link>
              <Link href="/store" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Connect</Link>
              <Link href="/privacy" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Privacy</Link>
              <Link href="/terms" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Terms</Link>
            </div>
            <span>Powered by Afterroar · Founded February 2025</span>
          </div>
        </div>
      </main>
    </>
  );
}
