import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'not authenticated' });
  }

  const userId = session.user.id;
  const results: Record<string, string> = { userId };

  // Test 1: Basic user query (minimal fields)
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    results.user_basic = u ? 'OK' : 'null';
  } catch (e: any) { results.user_basic = `FAIL: ${e.message.slice(0, 200)}`; }

  // Test 2: User with extended fields
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true, username: true, passportCode: true, membershipTier: true } });
    results.user_extended = u ? `OK (tier=${u.membershipTier})` : 'null';
  } catch (e: any) { results.user_extended = `FAIL: ${e.message.slice(0, 200)}`; }

  // Test 3: User identity fields
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { identityVerified: true, reputationScore: true, isFrozen: true, gameLibrary: true } });
    results.user_identity = u ? 'OK' : 'null';
  } catch (e: any) { results.user_identity = `FAIL: ${e.message.slice(0, 200)}`; }

  // Test 4: UserConsent
  try {
    const c = await prisma.userConsent.count({ where: { userId } });
    results.userConsent = `OK (${c} rows)`;
  } catch (e: any) { results.userConsent = `FAIL: ${e.message.slice(0, 200)}`; }

  // Test 5: PointsLedger
  try {
    const p = await prisma.pointsLedger.count({ where: { userId } });
    results.pointsLedger = `OK (${p} rows)`;
  } catch (e: any) { results.pointsLedger = `FAIL: ${e.message.slice(0, 200)}`; }

  // Test 6: UserActivity
  try {
    const a = await prisma.userActivity.count({ where: { userId } });
    results.userActivity = `OK (${a} rows)`;
  } catch (e: any) { results.userActivity = `FAIL: ${e.message.slice(0, 200)}`; }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
