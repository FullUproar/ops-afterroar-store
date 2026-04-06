import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days
  pages: {
    signIn: "/login",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user?.passwordHash) return null;

        const isValid = await compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) return null;

        return {
          id: user.id,
          name: user.displayName,
          email: user.email,
          image: user.avatarUrl,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // On initial sign-in (Google or credentials), look up the HQ user
      if (account) {
        if (account.provider === "google" && profile?.email) {
          let hqUser = await prisma.user.findUnique({
            where: { email: profile.email },
          });
          // Auto-create HQ user on first Google sign-in
          if (!hqUser) {
            hqUser = await prisma.user.create({
              data: {
                email: profile.email,
                displayName: profile.name || profile.email.split("@")[0],
                avatarUrl: (profile as Record<string, unknown>).picture as string || null,
              },
            });
          }
          token.id = hqUser.id;
          token.email = hqUser.email;
          token.name = hqUser.displayName;
          token.picture = hqUser.avatarUrl;
        } else if (account.provider === "credentials" && token.email) {
          const hqUser = await prisma.user.findUnique({
            where: { email: token.email },
          });
          if (hqUser) {
            token.id = hqUser.id;
          }
        }
      }

      // Embed store/staff context in the JWT for faster tenant resolution
      // Only look up if not already cached in token
      if (token.id && !token.storeId) {
        const staffRecord = await prisma.posStaff.findFirst({
          where: { user_id: token.id as string, active: true },
          select: { id: true, store_id: true, role: true },
        });
        if (staffRecord) {
          token.staffId = staffRecord.id;
          token.storeId = staffRecord.store_id;
          token.role = staffRecord.role;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        // Expose tenant context in session for client components
        (session as unknown as Record<string, unknown>).staffId = token.staffId;
        (session as unknown as Record<string, unknown>).storeId = token.storeId;
        (session as unknown as Record<string, unknown>).role = token.role;
      }
      return session;
    },
  },
});
