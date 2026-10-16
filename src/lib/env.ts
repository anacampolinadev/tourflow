import { z } from "zod";

const authSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.url(),
  EMAIL_SERVER_HOST: z.string().min(1),
  EMAIL_SERVER_PORT: z.coerce.number().int().min(1).max(65535),
  EMAIL_SERVER_USER: z.string().min(1),
  EMAIL_SERVER_PASSWORD: z.string().min(1),
  EMAIL_FROM: z.email(),
});

export function getAuthEnv() {
  const parsed = authSchema.safeParse(process.env);
  if (!parsed.success) throw new Error("Configuração de autenticação incompleta. Consulte .env.example.");
  if (process.env.NODE_ENV === "production" && !parsed.data.AUTH_URL.startsWith("https://")) throw new Error("AUTH_URL exige HTTPS em produção.");
  return parsed.data;
}

export function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value || !/^postgres(ql)?:\/\//.test(value)) throw new Error("DATABASE_URL PostgreSQL não configurada.");
  return value;
}
