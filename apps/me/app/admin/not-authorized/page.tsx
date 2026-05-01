import { auth } from '@/lib/auth-config';
import { ChromeNav, Workbench, PlayerCard } from '@/app/components/card-shell';
import { TYPE, TitleBar } from '@/app/components/ui';
import { isAdminEmail } from '@/lib/admin-auth';

/**
 * Lands here when a signed-in user hits an /admin route but isn't on
 * the ADMIN_EMAILS allowlist. Distinct from /login (the user IS signed
 * in, they just aren't authorized). Surfaces enough diagnostic info
 * that a first-time setup mistake (missing env var) is obvious.
 */
export default async function NotAuthorizedPage() {
  const session = await auth();
  const email = session?.user?.email ?? null;
  const allowlistConfigured = !!process.env.ADMIN_EMAILS?.trim();
  // We don't show the actual allowlist here (could be sensitive in
  // shared environments), just whether it's set.
  const onList = email ? isAdminEmail(email) : false;

  return (
    <>
      <ChromeNav signedIn={!!email} email={email} />
      <Workbench>
        <PlayerCard maxWidth="32rem">
          <TitleBar left="Not Authorized" />
          <div
            style={{
              padding: '2rem var(--pad-x) 1.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ fontSize: '2.5rem', textAlign: 'center', color: 'var(--orange)' }}>🚫</div>
            <h1
              style={{
                ...TYPE.display,
                fontSize: '1.5rem',
                color: 'var(--cream)',
                margin: 0,
                textAlign: 'center',
              }}
            >
              Admin access required
            </h1>
            <p style={{ ...TYPE.body, color: 'var(--ink-soft)', fontSize: '0.92rem', lineHeight: 1.55, textAlign: 'center', margin: 0 }}>
              You&apos;re signed in as{' '}
              <strong style={{ color: 'var(--cream)' }}>{email || '(unknown)'}</strong>, but
              this email isn&apos;t on the admin allowlist.
            </p>

            {/* Diagnostic block — only shown for self-service debugging.
                Helpful at platform-startup; can be removed once the
                ops team is stable. */}
            <div
              style={{
                padding: '0.85rem 1rem',
                background: 'var(--panel-mute)',
                border: '1px solid var(--rule)',
                borderRadius: '0.5rem',
                ...TYPE.body,
                fontSize: '0.82rem',
                color: 'var(--ink-soft)',
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: 'var(--cream)' }}>Diagnostics</strong>
              <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
                <li>
                  ADMIN_EMAILS env var:{' '}
                  <strong style={{ color: allowlistConfigured ? '#10b981' : 'var(--red)' }}>
                    {allowlistConfigured ? 'configured' : 'NOT SET'}
                  </strong>
                </li>
                <li>
                  Your email on allowlist:{' '}
                  <strong style={{ color: onList ? '#10b981' : 'var(--red)' }}>
                    {onList ? 'yes' : 'no'}
                  </strong>
                </li>
              </ul>

              {!allowlistConfigured && (
                <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--ink-faint)', lineHeight: 1.5 }}>
                  Setup: in the Vercel dashboard for the{' '}
                  <code style={{ color: 'var(--cream)' }}>afterroar-me</code> project, add an
                  environment variable <code style={{ color: 'var(--cream)' }}>ADMIN_EMAILS</code>{' '}
                  with a comma-separated list of admin emails (Production scope), then redeploy.
                </p>
              )}
              {allowlistConfigured && !onList && (
                <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--ink-faint)', lineHeight: 1.5 }}>
                  An admin must add your email to <code style={{ color: 'var(--cream)' }}>ADMIN_EMAILS</code>{' '}
                  in the Vercel project env, then redeploy.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
              <a
                href="/"
                style={{
                  color: 'var(--orange)',
                  ...TYPE.body,
                  fontSize: '0.88rem',
                  textDecoration: 'none',
                }}
              >
                ← Back to your Passport
              </a>
            </div>
          </div>
        </PlayerCard>
      </Workbench>
    </>
  );
}
