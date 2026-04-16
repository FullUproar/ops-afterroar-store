'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
    }}>
      <div style={{
        maxWidth: '24rem',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: 900,
          color: '#FF8200',
          margin: 0,
        }}>
          Log in with Afterroar
        </h1>

        <p style={{
          fontSize: '1rem',
          color: '#9ca3af',
          margin: 0,
          lineHeight: 1.6,
        }}>
          Your tabletop identity. One login, every store, every app.
        </p>

        {error && (
          <div style={{
            padding: '0.75rem 1rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#fca5a5',
            fontSize: '0.875rem',
          }}>
            {error === 'OAuthSignin' && 'Could not start sign-in. Please try again.'}
            {error === 'OAuthCallback' && 'Sign-in was interrupted. Please try again.'}
            {error === 'Default' && 'Something went wrong. Please try again.'}
            {!['OAuthSignin', 'OAuthCallback', 'Default'].includes(error) && 'Sign-in failed. Please try again.'}
          </div>
        )}

        <button
          onClick={() => signIn('google', { callbackUrl })}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            width: '100%',
            padding: '0.875rem 1.5rem',
            background: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#FF8200';
            e.currentTarget.style.background = '#1a2332';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#374151';
            e.currentTarget.style.background = '#1f2937';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <div style={{
          marginTop: '1rem',
          fontSize: '0.75rem',
          color: '#6b7280',
          lineHeight: 1.5,
        }}>
          By signing in, you create an Afterroar Passport and agree to our{' '}
          <a href="/terms" style={{ color: '#FF8200' }}>Terms of Service</a> and{' '}
          <a href="/privacy" style={{ color: '#FF8200' }}>Privacy Policy</a>.
          Governed by <a href="/credo" style={{ color: '#FF8200' }}>the Afterroar Credo</a>:
          your data is yours — see it, control it, delete it anytime.
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}>
        <p style={{ color: '#FF8200', fontWeight: 700 }}>Loading...</p>
      </main>
    }>
      <LoginContent />
    </Suspense>
  );
}
