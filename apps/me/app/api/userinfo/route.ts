import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/oauth/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/userinfo — OAuth userinfo endpoint.
 *
 * Auth: Bearer token OR ServerKey + X-User-Id.
 * Returns user profile data scoped by granted permissions.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
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

  const scopes = (auth.scope || '').split(' ');
  const response: Record<string, unknown> = {
    sub: user.id,
  };

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
