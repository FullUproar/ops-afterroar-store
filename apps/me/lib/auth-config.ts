import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { CustomPrismaAdapter } from '@/lib/auth-adapter';
import { prisma } from '@/lib/prisma';
import { assignPassportCode } from '@/lib/passport-code';
import { pushVerifiedCountToSmiirl } from '@/lib/smiirl';
import { readAgeGateCookie, isUnder13Blocked, hasAdultAttestation } from '@/lib/age-gate';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: CustomPrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Trust Google's email_verified flag — when true, mark the user as
      // email-verified at sign-in so we don't bug them with our own link.
      profile(profile) {
        return {
          id: profile.sub,
          email: profile.email,
          name: profile.name,
          image: profile.picture,
          emailVerified: profile.email_verified ? new Date() : null,
        } as { id: string; email: string; name: string; image: string; emailVerified: Date | null };
      },
    }),
    Credentials({
      // Email + password fallback. We require emailVerified before allowing
      // sign-in so the verification flow stays meaningful.
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').trim().toLowerCase();
        const password = String(credentials?.password ?? '');
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) {
          // Either no such user, or the user signed up with OAuth and has no
          // password set. Don't leak which by returning a generic null.
          return null;
        }
        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;

        if (!user.emailVerified) {
          // Surface as a thrown error so the login page can show "verify your
          // email first" rather than silent reject. NextAuth will route this
          // to the error= query param.
          throw new Error('EmailNotVerified');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.displayName ?? null,
          image: user.avatarUrl ?? null,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    /**
     * Age-gate enforcement on OAuth sign-up (distillery model).
     *
     * Existing users (have a User row already) bypass the gate; they're
     * signing in, not signing up. New users (no row yet) must have
     * either:
     *   - the short-lived adult-attestation cookie (set by /signup when
     *     the user clicks the 18+ checkbox before clicking Google), OR
     *   - an "adult" age-gate cookie (the user came through /signup/age
     *     and entered a DOB making them 18+)
     *
     * Teens get pushed to /signup/teen. <13-blocked devices refused.
     * Anyone without any attestation gets sent to /signup so they can
     * check the box first.
     *
     * Credentials sign-ins always go through /api/auth/signup first, so
     * the age gate is enforced there; here we just need to handle OAuth.
     */
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return true;
      if (!user.email) return false;

      const existing = await prisma.user.findUnique({
        where: { email: user.email.toLowerCase() },
      });
      if (existing) return true; // Existing user signing in; skip age gate.

      // New OAuth signup.
      if (await isUnder13Blocked()) {
        return '/signup/blocked';
      }
      const ageCookie = await readAgeGateCookie();
      if (ageCookie?.cohort === 'under13') return '/signup/blocked';
      if (ageCookie?.cohort === 'teen') return '/signup/teen';
      if (ageCookie?.cohort === 'adult') return true;
      // No DOB on file. Accept the lighter adult-attestation cookie
      // (the 18+ checkbox click on /signup) for the distillery-style flow.
      if (await hasAdultAttestation()) return true;
      // No attestation at all. Bounce to /signup so the user can check
      // the box, or use the under-18 link for the DOB-based path.
      return '/signup';
    },
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
      if (!user.id) return;

      // Hardened: every step is independently try/caught so a failure here
      // can never crash the auth flow. Earlier versions of this handler let
      // a thrown exception bubble up and 500'd the OAuth callback.
      // Generate the 8-char Passport code via the shared helper.
      // Same logic now used by both OAuth (here) and email signup (in
      // /api/auth/signup) so future flows can't drift apart.
      await assignPassportCode(user.id).catch((err) => {
        console.error('[auth] Failed to set passportCode:', err);
      });

      // Persist DOB IF the user came through the DOB-based path. Adults
      // who used the lighter checkbox attestation never give us a DOB,
      // which is intentional under the distillery model: we only collect
      // what we need and only when we need it.
      try {
        const ageCookie = await readAgeGateCookie();
        if (ageCookie?.cohort === 'adult') {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              dateOfBirth: new Date(ageCookie.dob),
              isMinor: false,
              defaultVisibility: 'public',
            },
          });
        } else {
          // Adult attestation only; ensure isMinor + visibility defaults
          // are set correctly without writing a fake DOB.
          await prisma.user.update({
            where: { id: user.id },
            data: { isMinor: false, defaultVisibility: 'public' },
          });
        }
      } catch (err) {
        console.error('[auth] Failed to persist age fields on createUser:', err);
      }

      try {
        // Auto-issue Passport Pioneer badge to new users
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

      // Push the verified-user count to the Smiirl so the convention
      // counter ticks up within ~1s. Google signups are auto-verified
      // via the Google profile callback (we trust email_verified) and
      // therefore never hit the email-verification route where the
      // existing Smiirl push lives. Without this, only credential
      // signups bumped the counter and the hourly cron caught the rest.
      // Fire-and-forget; never block auth on the device call. The push
      // helper queries DB for verified count, so for unverified
      // credential signups the count just doesn't include them yet.
      pushVerifiedCountToSmiirl().catch((err) =>
        console.error('[auth] Smiirl push on createUser failed:', err),
      );
    },
  },
});
