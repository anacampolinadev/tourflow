import "server-only";
import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { createTransport } from "nodemailer";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getAuthEnv } from "@/lib/env";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = getAuthEnv();
  const db = getDb();
  return {
    adapter: PrismaAdapter(db),
    secret: env.AUTH_SECRET,
    trustHost: true, // Canonical callback origin is pinned in the route handler and AUTH_URL.
    session: { strategy: "database", maxAge: 60 * 60 * 8 },
    pages: { signIn: "/login", verifyRequest: "/login/check-email", error: "/login" },
    providers: [Nodemailer({
      server: {
        host: env.EMAIL_SERVER_HOST, port: env.EMAIL_SERVER_PORT,
        secure: env.EMAIL_SERVER_PORT === 465,
        auth: { user: env.EMAIL_SERVER_USER, pass: env.EMAIL_SERVER_PASSWORD },
        requireTLS: process.env.NODE_ENV === "production",
      },
      from: env.EMAIL_FROM,
      maxAge: 60 * 15,
      normalizeIdentifier: (identifier) => z.email().max(254).parse(identifier.trim().toLowerCase()),
      async sendVerificationRequest({ identifier, url, provider }) {
        // Unknown addresses get the same outward response, but never a login email.
        const user = await db.user.findUnique({ where: { email: identifier }, select: { active: true } });
        if (!user?.active) return;
        const key = createHmac("sha256", env.AUTH_SECRET).update(identifier).digest("hex");
        const now = new Date();
        const cutoff = new Date(now.getTime() - 15 * 60_000);
        // Atomic fixed window; works across application instances, including concurrent requests.
        const claimed = await db.$queryRaw<Array<{ attempts: number }>>`
          INSERT INTO "LoginThrottle" ("key", "attempts", "windowStart") VALUES (${key}, 1, ${now})
          ON CONFLICT ("key") DO UPDATE SET
            "attempts" = CASE WHEN "LoginThrottle"."windowStart" <= ${cutoff} THEN 1 ELSE "LoginThrottle"."attempts" + 1 END,
            "windowStart" = CASE WHEN "LoginThrottle"."windowStart" <= ${cutoff} THEN ${now} ELSE "LoginThrottle"."windowStart" END
          WHERE "LoginThrottle"."windowStart" <= ${cutoff} OR "LoginThrottle"."attempts" < 3
          RETURNING "attempts"`;
        if (!claimed.length) return;
        if (new URL(url).origin !== new URL(env.AUTH_URL).origin) throw new Error("Origem de autenticação inválida.");
        const result = await createTransport(provider.server).sendMail({
          to: identifier, from: provider.from, subject: "Entrar na TourFlow",
          text: `Use este link para entrar na TourFlow. Expira em 15 minutos e só pode ser usado uma vez.\n\n${url}\n\nSe não solicitou o acesso, ignore esta mensagem.`,
        });
        if (result.rejected.length) throw new Error("Não foi possível enviar o link de acesso.");
      },
    })],
    callbacks: {
      async signIn({ user, email }) {
        if (email?.verificationRequest) return true;
        if (!user.email) return false;
        const existing = await db.user.findUnique({ where: { email: user.email }, select: { active: true } });
        return existing?.active === true;
      },
      async session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
      redirect({ url, baseUrl }) {
        const target = new URL(url, baseUrl);
        return target.origin === new URL(env.AUTH_URL).origin ? target.toString() : `${env.AUTH_URL}/workspace`;
      },
    },
    // Prevent provider errors from logging tokens, emails or transport credentials.
    logger: { error: () => console.error("Authentication request failed."), warn: () => {}, debug: () => {} },
  };
});
