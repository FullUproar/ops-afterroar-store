'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChromeNav, PlayerCard, Workbench } from '@/app/components/card-shell';
import { TYPE, TitleBar } from '@/app/components/ui';

function EmailSigninContent() {
  const searchParams = useSearchParams();
  const prefill = searchParams.get('email') || '';
  const [email, setEmail] = useState(prefill);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefill) setEmail(prefill);
  }, [prefill]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!email.includes('@')) {
      setError('Enter a valid email.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/email-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not send the sign-in link.');
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Try again.');
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <>
        <ChromeNav signedIn={false} />
        <Workbench>
          <PlayerCard maxWidth="26rem">
            <TitleBar left="Check Your Inbox" />
            <div style={{
              padding: '2rem var(--pad-x) 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '3rem', lineHeight: 1, color: 'var(--orange)' }}>📬</div>
              <h1 style={{
                ...TYPE.display,
                fontSize: 'clamp(1.4rem, 4vw, 1.7rem)',
                color: 'var(--cream)',
                margin: 0,
              }}>
                Sign-in link sent
              </h1>
              <p style={{ ...TYPE.body, fontSize: '0.92rem', color: 'var(--ink-soft)', lineHeight: 1.55, margin: 0 }}>
                If an account exists for <strong style={{ color: 'var(--cream)' }}>{email}</strong>, we sent a sign-in link there. Open it on this device to be signed in.
              </p>
              <p style={{ ...TYPE.body, fontSize: '0.85rem', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 }}>
                The link expires in 15 minutes and can only be used once.
              </p>
              <a href="/login" style={{ color: 'var(--orange)', ...TYPE.body, fontSize: '0.88rem', marginTop: '0.5rem' }}>
                Back to sign in
              </a>
            </div>
          </PlayerCard>
        </Workbench>
      </>
    );
  }

  return (
    <>
      <ChromeNav signedIn={false} />
      <Workbench>
        <PlayerCard maxWidth="26rem">
          <TitleBar left="Sign In with Email" />
          <div style={{
            padding: '2rem var(--pad-x) 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{
                ...TYPE.display,
                fontSize: 'clamp(1.5rem, 4vw, 1.85rem)',
                color: 'var(--cream)',
                margin: 0,
                lineHeight: 1.1,
              }}>
                Sign in by<br />email link
              </h1>
              <p style={{ ...TYPE.body, fontSize: '0.9rem', color: 'var(--ink-soft)', margin: '0.75rem 0 0', lineHeight: 1.5 }}>
                No password needed. We&apos;ll email you a one-time link. Click it to sign in.
              </p>
            </div>

            {error && (
              <div style={{
                padding: '0.75rem 0.9rem',
                background: 'rgba(196, 77, 77, 0.08)',
                border: '1px solid rgba(196, 77, 77, 0.3)',
                color: 'var(--red)',
                ...TYPE.body,
                fontSize: '0.82rem',
              }}>
                {error}
              </div>
            )}

            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                autoFocus={!prefill}
                style={{
                  width: '100%',
                  padding: '0.75rem 0.9rem',
                  background: 'var(--panel-mute)',
                  border: '1.5px solid var(--rule)',
                  color: 'var(--cream)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.95rem',
                  outline: 'none',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--orange)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--rule)')}
              />
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
                {submitting ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </form>

            <p style={{ ...TYPE.body, fontSize: '0.85rem', color: 'var(--ink-soft)', textAlign: 'center', margin: 0 }}>
              Prefer a password?{' '}
              <a href="/login" style={{ color: 'var(--orange)' }}>
                Sign in normally
              </a>
            </p>
          </div>
        </PlayerCard>
      </Workbench>
    </>
  );
}

export default function EmailSigninPage() {
  return (
    <Suspense fallback={
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--orange)' }}>Loading…</p>
      </main>
    }>
      <EmailSigninContent />
    </Suspense>
  );
}
