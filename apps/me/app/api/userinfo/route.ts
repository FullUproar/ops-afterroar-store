import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/oauth/tokens';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/userinfo — OAuth userinfo endpoint.
 *
 * Returns user profile data for a valid access token.
 * Called by consuming apps (fulluproar.com, Store Ops, HQ) after
 * exchanging an auth code for an access token.
 *
 * Only returns fields the token's scopes authorize.
 * No PII beyond what was explicitly consented to.
 *
 * Security:
 * - Validates Bearer token signature + expiry via jose
 * - Only returns fields matching the token's granted scopes
 * - Never returns passwordHash or other sensitive fields
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const payload = await verifyAccessToken(token);

  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired access token' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      username: true,
      avatarUrl: true,
      passportCode: true,
      membershipTier: true,
      identityVerified: true,
      reputationScore: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const scopes = payload.scope.split(' ');
  const response: Record<string, unknown> = {
    sub: user.id,
  };

  if (scopes.includes('openid')) {
    response.sub = user.id;
  }

  if (scopes.includes('profile')) {
    response.name = user.displayName;
    response.preferred_username = user.username;
    response.picture = user.avatarUrl;
    response.passport_code = user.passportCode;
    response.membership_tier = user.membershipTier;
    response.identity_verified = user.identityVerified;
    response.reputation_score = user.reputationScore;
    response.created_at = user.createdAt;
  }

  if (scopes.includes('email')) {
    response.email = user.email;
  }

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
