import { NextRequest } from 'next/server';
import { verifyAccessToken } from './tokens';
import { verifyServerAuth } from './server-auth';

/**
 * Unified API authentication — supports both auth methods:
 *
 * 1. Bearer token (from OAuth SSO flow) — user-initiated requests
 *    Authorization: Bearer <access_token>
 *
 * 2. ServerKey (server-to-server) — app reading on behalf of user
 *    Authorization: ServerKey <client_id>:<client_secret>
 *    X-User-Id: <userId>
 *
 * Returns { userId, scope, clientId } or null if invalid.
 */

export interface ApiAuthResult {
  userId: string;
  clientId: string;
  scope?: string;
  authMethod: 'bearer' | 'server_key';
}

export async function authenticateApiRequest(request: NextRequest): Promise<ApiAuthResult | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  // Try Bearer token first
  if (authHeader.startsWith('Bearer ')) {
    const payload = await verifyAccessToken(authHeader.slice(7));
    if (payload) {
      return {
        userId: payload.userId,
        clientId: payload.clientId,
        scope: payload.scope,
        authMethod: 'bearer',
      };
    }
    return null;
  }

  // Try ServerKey
  if (authHeader.startsWith('ServerKey ')) {
    const userId = request.headers.get('x-user-id');
    const result = await verifyServerAuth(authHeader, userId);
    if (result) {
      return {
        userId: result.userId,
        clientId: result.clientId,
        scope: 'openid profile email library:read points:read checkins:read',
        authMethod: 'server_key',
      };
    }
    return null;
  }

  return null;
}
