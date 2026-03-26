import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
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
          const hqUser = await prisma.user.findUnique({
            where: { email: profile.email },
          });
          if (hqUser) {
            token.id = hqUser.id;
            token.email = hqUser.email;
            token.name = hqUser.displayName;
            token.picture = hqUser.avatarUrl;
          }
        } else if (account.provider === "credentials" && token.email) {
          const hqUser = await prisma.user.findUnique({
            where: { email: token.email },
          });
          if (hqUser) {
            token.id = hqUser.id;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
