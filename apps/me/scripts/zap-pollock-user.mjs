// One-off: delete the thosepollocks@gmail.com Passport account so Shawn
// can re-test the new-signup claim flow end-to-end.
//
// Run from c:/dev/FULL UPROAR PLATFORM/ops-afterroar-store/apps/me:
//   node scripts/zap-pollock-user.mjs

import { config as dotenvConfig } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ME = path.resolve(__dirname, '..');
dotenvConfig({ path: path.join(APP_ME, '.env.local') });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('No DATABASE_URL found in apps/me/.env.local');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

const TARGET_EMAIL = 'thosepollocks@gmail.com';

const user = await prisma.user.findUnique({
  where: { email: TARGET_EMAIL },
  select: {
    id: true,
    email: true,
    displayName: true,
    createdAt: true,
    emailVerified: true,
  },
});

if (!user) {
  console.log(`No user with email ${TARGET_EMAIL} on Passport. Nothing to zap.`);
  await prisma.$disconnect();
  process.exit(0);
}

console.log('Found:');
console.log(`  id=${user.id}`);
console.log(`  email=${user.email}`);
console.log(`  displayName=${user.displayName}`);
console.log(`  emailVerified=${user.emailVerified}`);
console.log(`  createdAt=${user.createdAt.toISOString()}`);
console.log('');

// Best-effort cleanup of related rows. Cascades on User should handle
// most of these but we delete explicitly for the ones that don't (or
// that we want to be sure of).
const counts = {};

counts.accounts = (await prisma.account.deleteMany({ where: { userId: user.id } })).count;
counts.userActivity = (await prisma.userActivity.deleteMany({ where: { userId: user.id } })).count;
counts.userBadges = (await prisma.userBadge.deleteMany({ where: { userId: user.id } })).count;

// VerificationToken is keyed by identifier (email), not userId.
counts.verificationTokens = (await prisma.verificationToken.deleteMany({
  where: { identifier: TARGET_EMAIL },
})).count;

// Finally the user itself.
await prisma.user.delete({ where: { id: user.id } });
counts.user = 1;

console.log('Deleted:');
for (const [key, count] of Object.entries(counts)) {
  console.log(`  ${key}: ${count}`);
}

await prisma.$disconnect();
