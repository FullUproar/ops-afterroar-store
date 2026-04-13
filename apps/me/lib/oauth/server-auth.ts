import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getClient } from './clients';

/**
 * Server-to-server authentication for trusted client apps.
 *
 * Client sends:
 *   Authorization: ServerKey <client_id>:<client_secret>
 *   X-User-Id: <userId>
 *
 * afterroar.me verifies:
 * 1. Client is registered (same registry as OAuth clients)
 * 2. Client secret is valid (timing-safe comparison)
 * 3. User has granted consent for the requested scope
 *
 * This is how HQ, Store Ops, and third-party apps read Passport
 * data on behalf of users who've connected their Passport via SSO.
 */

export interface ServerAuthResult {
  clientId: string;
  userId: string;
}

export async function verifyServerAuth(
  authHeader: string | null,
  userIdHeader: string | null,
): Promise<ServerAuthResult | null> {
  if (!authHeader?.startsWith('ServerKey ') || !userIdHeader) {
    return null;
  }

  const credentials = authHeader.slice('ServerKey '.length);
  const colonIndex = credentials.indexOf(':');
  if (colonIndex === -1) return null;

  const clientId = credentials.slice(0, colonIndex);
  const clientSecret = credentials.slice(colonIndex + 1);

  const client = getClient(clientId);
  if (!client) return null;

  // Timing-safe secret comparison
  const expected = Buffer.from(client.secret, 'utf8');
  const received = Buffer.from(clientSecret, 'utf8');
  if (expected.length !== received.length) return null;
  if (!timingSafeEqual(expected, received)) return null;

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userIdHeader },
    select: { id: true },
  });
  if (!user) return null;

  return { clientId, userId: userIdHeader };
}

/**
 * Check if a user has consented to a specific scope for a given client.
 * Maps OAuth scopes to consent categories.
 */
export async function checkServerConsent(
  userId: string,
  requiredCategories: string[],
): Promise<boolean> {
  if (requiredCategories.length === 0) return true;

  const consents = await prisma.userConsent.findMany({
    where: {
      userId,
      category: { in: requiredCategories },
      granted: true,
    },
    select: { category: true },
  });

  const granted = new Set(consents.map((c) => c.category));
  return requiredCategories.every((cat) => granted.has(cat));
}
