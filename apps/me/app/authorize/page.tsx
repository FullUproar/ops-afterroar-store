import { auth } from '@/lib/auth-config';
import { redirect } from 'next/navigation';
import { getClient, validateRedirectUri } from '@/lib/oauth/clients';
import { mintAuthCode } from '@/lib/oauth/tokens';
import { Suspense } from 'react';

interface SearchParams {
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  response_type?: string;
}

async function AuthorizeContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { client_id, redirect_uri, scope, state, response_type } = params;

  // Validate required params
  if (!client_id || !redirect_uri || response_type !== 'code') {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
        <div style={{ maxWidth: '24rem', textAlign: 'center' }}>
          <h1 style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 900 }}>Invalid Request</h1>
          <p style={{ color: '#9ca3af', marginTop: '1rem' }}>
            Missing required parameters. This page should be accessed via an OAuth authorization flow,
            not directly.
          </p>
        </div>
      </main>
    );
  }

  // Validate client
  const client = getClient(client_id);
  if (!client || !validateRedirectUri(client, redirect_uri)) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
        <div style={{ maxWidth: '24rem', textAlign: 'center' }}>
          <h1 style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 900 }}>Unknown Application</h1>
          <p style={{ color: '#9ca3af', marginTop: '1rem' }}>
            The application requesting access is not registered with Afterroar.
          </p>
        </div>
      </main>
    );
  }

  // Check auth — redirect to login if not signed in
  const session = await auth();
  if (!session?.user?.id) {
    const returnUrl = `/authorize?client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${encodeURIComponent(scope || 'openid profile')}&state=${encodeURIComponent(state || '')}&response_type=code`;
    redirect(`/login?callbackUrl=${encodeURIComponent(returnUrl)}`);
  }

  const requestedScopes = (scope || 'openid profile').split(' ');
  const userId = session.user.id;

  // Server action: approve the authorization
  async function approve() {
    'use server';

    const code = await mintAuthCode({
      userId,
      clientId: client_id!,
      redirectUri: redirect_uri!,
      scope: scope || 'openid profile',
    });

    const url = new URL(redirect_uri!);
    url.searchParams.set('code', code);
    if (state) url.searchParams.set('state', state);

    redirect(url.toString());
  }

  // Server action: deny the authorization
  async function deny() {
    'use server';

    const url = new URL(redirect_uri!);
    url.searchParams.set('error', 'access_denied');
    if (state) url.searchParams.set('state', state);

    redirect(url.toString());
  }

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
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontSize: '1.5rem',
            fontWeight: 900,
            color: '#FF8200',
            margin: 0,
          }}>
            Authorize {client.name}
          </h1>
          <p style={{
            color: '#9ca3af',
            fontSize: '0.95rem',
            marginTop: '0.5rem',
          }}>
            <strong style={{ color: '#e2e8f0' }}>{client.name}</strong> wants
            to access your Afterroar Passport.
          </p>
        </div>

        <div style={{
          padding: '1.25rem',
          background: '#1f2937',
          borderRadius: '8px',
          border: '1px solid #374151',
        }}>
          <p style={{ color: '#e2e8f0', fontWeight: 700, margin: '0 0 0.75rem 0', fontSize: '0.9rem' }}>
            This app is requesting:
          </p>
          <ul style={{ margin: 0, padding: '0 0 0 1.25rem', color: '#9ca3af', fontSize: '0.875rem', lineHeight: 2 }}>
            {requestedScopes.includes('openid') && <li>Verify your identity</li>}
            {requestedScopes.includes('profile') && <li>Your display name and avatar</li>}
            {requestedScopes.includes('email') && <li>Your email address</li>}
            {requestedScopes.includes('library:read') && <li>View your game library</li>}
            {requestedScopes.includes('points:read') && <li>View your Loyalty Points balance</li>}
            {requestedScopes.includes('checkins:read') && <li>View your store check-in history</li>}
          </ul>
        </div>

        <p style={{ fontSize: '0.8rem', color: '#6b7280', textAlign: 'center', margin: 0 }}>
          Signed in as <strong style={{ color: '#e2e8f0' }}>{session.user.name || session.user.email}</strong>.
          You can revoke this access anytime from your Passport settings.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <form action={deny} style={{ flex: 1 }}>
            <button type="submit" style={{
              width: '100%',
              padding: '0.75rem',
              background: '#374151',
              border: '1px solid #4b5563',
              borderRadius: '8px',
              color: '#9ca3af',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}>
              Deny
            </button>
          </form>
          <form action={approve} style={{ flex: 2 }}>
            <button type="submit" style={{
              width: '100%',
              padding: '0.75rem',
              background: '#FF8200',
              border: 'none',
              borderRadius: '8px',
              color: '#0a0a0a',
              fontSize: '0.95rem',
              fontWeight: 900,
              cursor: 'pointer',
            }}>
              Allow
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function AuthorizePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: '#FF8200', fontWeight: 700 }}>Loading...</p>
      </main>
    }>
      <AuthorizeContent searchParams={searchParams} />
    </Suspense>
  );
}
