import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const providers: NextAuthOptions["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { prompt: "select_account" } },
    })
  );
}

providers.push(
  CredentialsProvider({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email?.trim().toLowerCase();
      const password = credentials?.password ?? "";
      if (!email || !password) return null;
      const user = await db.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) return null;
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined,
      };
    },
  })
);

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/" }, // the app is a single-route SPA; login is a view state
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email!;
        if (user.email) {
          await db.user.upsert({
            where: { email: user.email.toLowerCase() },
            create: {
              email: user.email.toLowerCase(),
              name: user.name ?? undefined,
              avatarSeed: user.email.split("@")[0],
            },
            update: user.name ? { name: user.name } : {},
          });
        }
      }
      // Always refresh profile fields from the DB so changes (onboarding,
      // profile edits) propagate into the session without re-login.
      if (!token.email) return token;
      const dbUser = await db.user.findUnique({
        where: { email: token.email! },
        select: {
          id: true,
          name: true,
          course: true,
          semester: true,
          examDate: true,
          onboarded: true,
          avatarSeed: true,
        },
      });
      if (dbUser) {
        token.id = dbUser.id;
        token.name = dbUser.name;
        token.course = dbUser.course;
        token.semester = dbUser.semester;
        token.examDate = dbUser.examDate;
        token.onboarded = dbUser.onboarded;
        token.avatarSeed = dbUser.avatarSeed;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = (token.name as string) ?? undefined;
        (session.user as Record<string, unknown>).course = token.course;
        (session.user as Record<string, unknown>).semester = token.semester;
        (session.user as Record<string, unknown>).examDate = token.examDate;
        (session.user as Record<string, unknown>).onboarded = token.onboarded;
        (session.user as Record<string, unknown>).avatarSeed = token.avatarSeed;
      }
      return session;
    },
  },
};
