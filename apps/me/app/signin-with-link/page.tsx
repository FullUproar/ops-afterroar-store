'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ChromeNav, PlayerCard, Workbench } from '@/app/components/card-shell';
import { TYPE, TitleBar } from '@/app/components/ui';

function SigninWithLinkContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Guard against double-fire: signIn() will hit the magic-link
  // Credentials provider, which deletes the token on consume. If React
  // strict-mode (or a redirect) re-renders this effect, the second call
  // would fail with a fresh "Invalid token" error. Track once-only.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (!token || !email) {
      setErrorMessage('This sign-in link is missing pieces. Try requesting a new one.');
      setStatus('error');
      return;
    }

    (async () => {
      const result = await signIn('magic-link', {
        email,
        token,
        redirect: false,
      });

      if (result?.error) {
        if (result.error.includes('MagicLinkExpired')) {
          setErrorMessage('This link expired. Request a new one to sign in.');
        } else if (result.error.includes('EmailNotVerified')) {
          setErrorMessage('Verify your email first. Check your inbox for the verification link from when you signed up.');
        } else {
          // Includes 'CredentialsSignin' (generic NextAuth wrap), which
          // covers both wrong-email and already-used-token cases. Don't
          // leak which.
          setErrorMessage('That sign-in link is invalid or already used. Request a new one.');
        }
        setStatus('error');
        return;
      }

      setStatus('success');
      // Brief success state before redirect, so the user sees confirmation
      // rather than a flash to /me.
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 800);
    })();
  }, [token, email, router]);

  return (
    <>
      <ChromeNav signedIn={false} />
      <Workbench>
        <PlayerCard maxWidth="26rem">
          <TitleBar left={status === 'error' ? 'Hmm' : 'Signing you in'} />
          <div style={{
            padding: '2rem var(--pad-x) 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
            textAlign: 'center',
          }}>
            {status === 'pending' && (
              <>
                <div style={{
                  width: '40px',
                  height: '40px',
                  border: '3px solid var(--rule)',
                  borderTopColor: 'var(--orange)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <p style={{ ...TYPE.body, fontSize: '0.92rem', color: 'var(--ink-soft)', margin: 0 }}>
                  Signing in as <strong style={{ color: 'var(--cream)' }}>{email}</strong>…
                </p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </>
            )}
            {status === 'success' && (
              <>
                <div style={{ fontSize: '3rem', lineHeight: 1, color: 'var(--green, #7db87d)' }}>✓</div>
                <h1 style={{ ...TYPE.display, fontSize: '1.4rem', color: 'var(--cream)', margin: 0 }}>
                  Welcome back
                </h1>
                <p style={{ ...TYPE.body, fontSize: '0.88rem', color: 'var(--ink-soft)', margin: 0 }}>
                  Redirecting…
                </p>
              </>
            )}
            {status === 'error' && (
              <>
                <h1 style={{ ...TYPE.display, fontSize: '1.4rem', color: 'var(--cream)', margin: 0 }}>
                  Could not sign you in
                </h1>
                <p style={{ ...TYPE.body, fontSize: '0.9rem', color: 'var(--ink-soft)', margin: 0, lineHeight: 1.5 }}>
                  {errorMessage}
                </p>
                <a
                  href="/login"
                  style={{
                    color: 'var(--orange)',
                    ...TYPE.body,
                    fontSize: '0.88rem',
                    marginTop: '0.5rem',
                  }}
                >
                  Back to sign in
                </a>
              </>
            )}
          </div>
        </PlayerCard>
      </Workbench>
    </>
  );
}

export default function SigninWithLinkPage() {
  return (
    <Suspense fallback={
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--orange)' }}>Loading…</p>
      </main>
    }>
      <SigninWithLinkContent />
    </Suspense>
  );
}
