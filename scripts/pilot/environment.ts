import { isIP } from "node:net";
import { z } from "zod";
export type PilotCheck = { key: string; ok: boolean; requirement: string };
const remoteHost = (host: string) => host.includes(".") && !isIP(host) && !/(^|\.)(localhost|local|test|invalid|example)$/i.test(host) && !/\s|[/:\\]/.test(host);
export function inspectPilotEnvironment(env: Record<string, string | undefined>) {
  const checks: PilotCheck[] = [];
  const add = (key: string, ok: boolean, requirement: string) => checks.push({ key, ok, requirement });
  add("TOURFLOW_ENVIRONMENT", env.TOURFLOW_ENVIRONMENT === "pilot", "Declarar explicitamente pilot; não reutilizar ambiente de produção.");
  let originValid = false;
  try { const url = new URL(env.AUTH_URL ?? ""); originValid = url.protocol === "https:" && remoteHost(url.hostname) && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password && !url.port; } catch {}
  add("AUTH_URL", originValid, "Origem HTTPS pública e canónica, sem caminho, query ou credenciais.");
  const secret = env.AUTH_SECRET ?? "";
  add("AUTH_SECRET", secret.length >= 32 && secret.length <= 512 && new Set(secret).size >= 8 && !/\s/.test(secret) && !/^(change|replace|example|your[-_])/i.test(secret), "Segredo próprio do piloto, aleatório, com pelo menos 32 caracteres; nunca imprimir.");
  let databaseValid = false;
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    const allowed = new Set(["sslmode", "channel_binding", "connect_timeout"]);
    databaseValid = ["postgres:", "postgresql:"].includes(url.protocol) && remoteHost(url.hostname) && Boolean(url.username && url.password && url.pathname.length > 1) && !url.hash && url.searchParams.get("sslmode") === "verify-full" && [...url.searchParams.keys()].every(key => allowed.has(key)) && url.searchParams.getAll("sslmode").length === 1;
  } catch {}
  add("DATABASE_URL", databaseValid, "PostgreSQL dedicado ao piloto, com utilizador/senha/base e sslmode=verify-full; sem opções que enfraqueçam TLS.");
  add("EMAIL_SERVER_HOST", remoteHost(env.EMAIL_SERVER_HOST ?? ""), "Servidor SMTP público, sem URL ou endereço local.");
  add("EMAIL_SERVER_PORT", ["465", "587"].includes(env.EMAIL_SERVER_PORT ?? ""), "SMTP TLS na porta 465 ou STARTTLS na porta 587.");
  for (const key of ["EMAIL_SERVER_USER", "EMAIL_SERVER_PASSWORD"]) add(key, Boolean(env[key]?.trim()) && !/[\r\n\0]/.test(env[key] ?? "") && !["local", "example", "changeme"].includes(env[key]?.toLowerCase() ?? ""), "Credencial própria de teste, guardada no gestor de segredos do ambiente.");
  const address = env.EMAIL_FROM ?? "";
  add("EMAIL_FROM", z.email().safeParse(address).success && remoteHost(address.split("@")[1] ?? ""), "Remetente válido; domínio e entrega ainda exigem validação no fornecedor.");
  add("RETELL_INGRESS_ENABLED", env.RETELL_INGRESS_ENABLED === "false", "Manter a telefonia desativada nesta publicação inicial; ligação real exige a etapa própria.");
  add("NODE_TLS_REJECT_UNAUTHORIZED", env.NODE_TLS_REJECT_UNAUTHORIZED !== "0", "Não desativar verificação de certificados no processo.");
  return { configurationReady: checks.every(check => check.ok), checks, productionReady: false as const };
}
