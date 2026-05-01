'use client';

import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ChromeNav } from '@/app/components/card-shell';
import { TYPE, TitleBar } from '@/app/components/ui';
import { PlayerCard, Workbench } from '@/app/components/card-shell';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // First-sign-in routing: when ?fresh=1 is set (passed by /verify-email
  // after a brand-new email signup verifies), route the user to /welcome
  // so they hit the onboarding tour instead of bouncing to home with no
  // context. The query string survives across the OAuth round-trip too.
  const fresh = searchParams.get('fresh') === '1';
  const callbackUrl = fresh ? '/welcome' : searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');
  const deleted = searchParams.get('deleted') === 'true';
  const verified = searchParams.get('verified') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    if (!email.includes('@') || !password) {
      setFormError('Enter your email and password.');
      return;
    }

    setSubmitting(true);
    const result = await signIn('credentials', {
      email: email.trim(),
      password,
      redirect: false,
    });
    setSubmitting(false);

    if (result?.error) {
      // NextAuth v5 wraps errors as `CredentialsSignin` regardless of the
      // underlying throw. We can read `result.code` (custom message we
      // threw in authorize) when set.
      if (result.error === 'CredentialsSignin') {
        // Most common — bad password or unknown email. Don't leak which.
        setFormError('Incorrect email or password.');
      } else if (result.error.includes('EmailNotVerified')) {
        setFormError('Verify your email first — check your inbox for the link.');
      } else {
        setFormError('Sign-in failed. Try again.');
      }
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <>
      <ChromeNav signedIn={false} />
      <Workbench>
        <PlayerCard maxWidth="26rem">
          <TitleBar left="Sign In" />
          <div style={{
            padding: '2rem var(--pad-x) 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ ...TYPE.display, fontSize: 'clamp(1.6rem, 5vw, 2rem)', color: 'var(--cream)', margin: 0, lineHeight: 1 }}>
                Log in with<br />Afterroar
              </h1>
              <p style={{ ...TYPE.body, fontSize: '0.9rem', color: 'var(--ink-soft)', margin: '0.75rem 0 0', lineHeight: 1.5 }}>
                Your portable gaming profile. Stores, library, points — all in one place.
              </p>
            </div>

            {verified && (
              <div style={{
                padding: '0.75rem 0.9rem',
                background: 'rgba(125, 184, 125, 0.08)',
                border: '1px solid rgba(125, 184, 125, 0.35)',
                color: 'var(--green, #7db87d)',
                ...TYPE.body,
                fontSize: '0.82rem',
              }}>
                Email verified. Sign in below.
              </div>
            )}

            {deleted && (
              <div style={{
                padding: '0.75rem 0.9rem',
                background: 'var(--green-mute)',
                border: '1px solid rgba(125, 184, 125, 0.35)',
                color: 'var(--green)',
                ...TYPE.body,
                fontSize: '0.82rem',
              }}>
                Your Passport has been deleted. All your data is gone.
              </div>
            )}

            {(error || formError) && (
              <div style={{
                padding: '0.75rem 0.9rem',
                background: 'rgba(196, 77, 77, 0.08)',
                border: '1px solid rgba(196, 77, 77, 0.3)',
                color: 'var(--red)',
                ...TYPE.body,
                fontSize: '0.82rem',
                lineHeight: 1.5,
              }}>
                {formError ? formError
                : error === 'OAuthAccountNotLinked' ? (
                    <>
                      An account with this email already exists, but it&apos;s not linked to Google. Sign in with your password below to continue. After you&apos;re in, you can link Google from your settings.
                    </>
                  )
                : error === 'OAuthSignin' ? 'Could not start sign-in with Google. Try again.'
                : error === 'OAuthCallback' ? 'Sign-in was interrupted. Try again.'
                : error === 'OAuthCreateAccount' ? 'Could not create your account. Try again, or use email and password instead.'
                : error === 'AccessDenied' ? 'Access denied. Try a different account or use email and password.'
                : error === 'Verification' ? 'That sign-in link expired or was already used. Sign in fresh below.'
                : error === 'Default' ? 'Something went wrong. Try again.'
                : 'Sign-in failed. Try again.'}
              </div>
            )}

            <button
              onClick={() => signIn('google', { callbackUrl })}
              disabled={submitting}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                width: '100%',
                padding: '0.9rem 1.25rem',
                background: 'var(--panel-mute)',
                border: '1.5px solid var(--rule)',
                color: 'var(--cream)',
                ...TYPE.display,
                fontSize: '0.95rem',
                letterSpacing: '0.01em',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.5 : 1,
                transition: 'border-color 0.2s ease, background 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--orange)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--rule)'; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--ink-faint)' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
              <span style={{ ...TYPE.body, fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
            </div>

            <form onSubmit={submitEmail} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                style={fieldStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--rule)')}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                required
                style={fieldStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--rule)')}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                margin: '-0.25rem 0 0',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}>
                <a
                  href={`/email-signin${email ? `?email=${encodeURIComponent(email)}` : ''}`}
                  style={{
                    ...TYPE.body,
                    fontSize: '0.78rem',
                    color: 'var(--ink-soft)',
                    textDecoration: 'underline',
                  }}
                >
                  Email me a link instead
                </a>
                <a
                  href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
                  style={{
                    ...TYPE.body,
                    fontSize: '0.78rem',
                    color: 'var(--ink-soft)',
                    textDecoration: 'underline',
                  }}
                >
                  Forgot password?
                </a>
              </div>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '0.9rem 1.25rem',
                  background: 'var(--orange)',
                  border: 'none',
                  color: 'var(--void, #1a1a1a)',
                  ...TYPE.display,
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Signing in…' : 'Sign in with Email'}
              </button>
            </form>

            <p style={{ ...TYPE.body, fontSize: '0.85rem', color: 'var(--ink-soft)', textAlign: 'center', margin: 0 }}>
              New here?{' '}
              <a href="/signup" style={{ color: 'var(--orange)' }}>
                Create a Passport
              </a>
              {' · '}
              <a href="/passport-101" style={{ color: 'var(--ink-soft)' }}>
                What is this?
              </a>
            </p>

            <p style={{ ...TYPE.body, fontSize: '0.82rem', color: 'var(--ink-faint)', lineHeight: 1.55, margin: 0, textAlign: 'center' }}>
              By signing in, you agree to our{' '}
              <a href="/terms" style={{ color: 'var(--orange)' }}>Terms of Service</a> and{' '}
              <a href="/privacy" style={{ color: 'var(--orange)' }}>Privacy Policy</a>.
              Governed by <a href="/credo" style={{ color: 'var(--orange)' }}>the Afterroar Credo</a>:
              your data is yours — see it, control it, delete it anytime.
            </p>
          </div>
        </PlayerCard>
      </Workbench>
    </>
  );
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 0.9rem',
  background: 'var(--panel-mute)',
  border: '1.5px solid var(--rule)',
  color: 'var(--cream)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.95rem',
  outline: 'none',
};

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}>
        <p style={{ color: 'var(--orange)', fontFamily: 'var(--font-display), sans-serif', fontWeight: 700 }}>Loading…</p>
      </main>
    }>
      <LoginContent />
    </Suspense>
  );
}
