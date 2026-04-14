import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Auto-issue Passport Pioneer badge to new users
      if (!user.id) return;
      try {
        const badge = await prisma.passportBadge.findUnique({ where: { slug: 'passport-pioneer' } });
        if (!badge || badge.retiredAt) return;
        if (badge.maxSupply && badge.totalIssued >= badge.maxSupply) return;

        await prisma.$transaction([
          prisma.userBadge.create({
            data: {
              userId: user.id,
              badgeId: badge.id,
              issuedBy: 'afterroar',
              reason: 'Early Passport adopter',
            },
          }),
          prisma.passportBadge.update({
            where: { id: badge.id },
            data: { totalIssued: { increment: 1 } },
          }),
        ]);
      } catch (err) {
        console.error('[auth] Failed to issue Pioneer badge:', err);
      }
    },
  },
});
