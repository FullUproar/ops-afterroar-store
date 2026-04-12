/**
 * OAuth client registry — hardcoded allowlist for Phase 1.
 *
 * Each client represents an app that can use "Log in with Afterroar."
 * client_id + redirect_uri must both match for an authorize request
 * to proceed. No open redirectors.
 *
 * Eventually this becomes a DB table for dynamic client registration.
 */

export interface OAuthClient {
  id: string;
  name: string;
  redirectUris: string[];
  secret: string;
}

const CLIENTS: Record<string, OAuthClient> = {
  'fulluproar-site': {
    id: 'fulluproar-site',
    name: "Full Uproar",
    redirectUris: [
      'https://fulluproar.com/api/auth/callback/afterroar',
      'https://www.fulluproar.com/api/auth/callback/afterroar',
      'http://localhost:3000/api/auth/callback/afterroar',
    ],
    secret: process.env.OAUTH_CLIENT_SECRET_FULLUPROAR || 'dev-secret-fulluproar',
  },
  'fulluproar-hq': {
    id: 'fulluproar-hq',
    name: "Fugly's HQ",
    redirectUris: [
      'https://hq.fulluproar.com/api/auth/callback/afterroar',
      'http://localhost:3002/api/auth/callback/afterroar',
    ],
    secret: process.env.OAUTH_CLIENT_SECRET_HQ || 'dev-secret-hq',
  },
  'afterroar-ops': {
    id: 'afterroar-ops',
    name: 'Store Ops',
    redirectUris: [
      'https://ops.afterroar.store/api/auth/callback/afterroar',
      'https://www.afterroar.store/api/auth/callback/afterroar',
      'http://localhost:3000/api/auth/callback/afterroar',
    ],
    secret: process.env.OAUTH_CLIENT_SECRET_OPS || 'dev-secret-ops',
  },
};

export function getClient(clientId: string): OAuthClient | null {
  return CLIENTS[clientId] || null;
}

export function validateRedirectUri(client: OAuthClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}

export function validateClientSecret(client: OAuthClient, secret: string): boolean {
  if (!client.secret || !secret) return false;
  const expected = client.secret.trim();
  let received = secret.trim();

  // Defensive: NextAuth may send URL-encoded secrets in form bodies
  // that don't get fully decoded (double-encoding edge case)
  if (expected !== received && received.includes('%')) {
    try { received = decodeURIComponent(received); } catch {}
  }

  if (expected !== received) {
    console.error('[oauth] secret mismatch debug:', {
      client: client.id,
      expected_len: expected.length,
      received_len: received.length,
      expected_prefix: expected.slice(0, 4),
      received_prefix: received.slice(0, 4),
      from_env: client.id === 'fulluproar-site' ? !!process.env.OAUTH_CLIENT_SECRET_FULLUPROAR : 'n/a',
    });
  }
  return expected === received;
}
