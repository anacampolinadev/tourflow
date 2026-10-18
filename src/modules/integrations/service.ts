import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { AccessDenied, currentTenant, requireCurrentSuperAdmin } from "@/modules/auth";
import { IntegrationError, retellInput } from "./domain";
import { checkRetellAgent, retellEnvironment } from "./retell-provider";
type Scope = "owner" | "admin";
async function access(organizationId: string, scope: Scope) {
  if (scope === "admin") return { actorId: (await requireCurrentSuperAdmin()).id, organizationId, admin: true };
  if (scope !== "owner") throw new AccessDenied();
  const context = await currentTenant(organizationId); if (context.role !== "OPERATOR_OWNER") throw new AccessDenied();
  return { actorId: context.actorId, organizationId: context.organizationId, admin: false };
}
async function validate(tx: Prisma.TransactionClient, context: Awaited<ReturnType<typeof access>>, lock = false) {
  if (lock) await tx.$queryRaw`SELECT "organizationId" FROM "OperatorProfile" WHERE "organizationId" = ${context.organizationId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: context.actorId }, select: { active: true, platformRole: true } });
  if (!user?.active) throw new AccessDenied();
  if (context.admin) { if (user.platformRole !== "SUPER_ADMIN") throw new AccessDenied(); }
  else { const member = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: context.organizationId, userId: context.actorId } } }); if (!member?.active || member.role !== "OPERATOR_OWNER") throw new AccessDenied(); }
}
function proof(connection: { checkResult: string; checkedAt: Date | null; credentialHash: string | null }, now = new Date()) {
  const environment = retellEnvironment();
  return Boolean(environment && connection.checkResult === "API_OK" && connection.credentialHash === environment.fingerprint && connection.checkedAt && connection.checkedAt.valueOf() <= now.valueOf() && now.valueOf() - connection.checkedAt.valueOf() <= 24 * 3600000);
}
export async function retellHealthInTransaction(tx: Prisma.TransactionClient, organizationId: string) {
  const connection = await tx.retellConnection.findUnique({ where: { organizationId } });
  const count = connection ? await tx.retellEvent.count({ where: { organizationId } }) : 0;
  return { configured: Boolean(connection), credentialsReady: Boolean(retellEnvironment()), enabled: connection?.enabled ?? false, verified: connection ? proof(connection) : false, checkedAt: connection?.checkedAt ?? null, checkResult: connection?.checkResult ?? "NOT_CHECKED", lastEventAt: connection?.lastEventAt ?? null, eventCount: count, quotaReached: count >= 5000 };
}
export async function readRetellConnection(organizationId: string, scope: Scope) {
  const context = await access(organizationId, scope);
  return getDb().$transaction(async tx => {
    await validate(tx, context);
    const organization = await tx.organization.findUnique({ where: { id: context.organizationId }, select: { name: true } }); if (!organization) return null;
    const connection = await tx.retellConnection.findUnique({ where: { organizationId: context.organizationId }, select: { agentId: true, enabled: true, version: true } });
    const health = await retellHealthInTransaction(tx, context.organizationId);
    const events = await tx.retellEvent.findMany({ where: { organizationId: context.organizationId }, orderBy: [{ receivedAt: "desc" }, { id: "desc" }], take: 20, select: { id: true, event: true, receivedAt: true } });
    if (context.admin) await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "admin.retell.read", metadata: {} } });
    return { organization, connection, health, events };
  }, { isolationLevel: "RepeatableRead" });
}
export async function configureRetell(organizationId: string, raw: unknown) {
  const context = await access(organizationId, "admin"), input = retellInput.parse(raw);
  return getDb().$transaction(async tx => {
    await validate(tx, context, true);
    if (!await tx.operatorProfile.findUnique({ where: { organizationId: context.organizationId }, select: { id: true } })) throw new IntegrationError("Operador não encontrado.");
    const connection = await tx.retellConnection.findUnique({ where: { organizationId: context.organizationId } });
    if ((connection?.version ?? 0) !== input.expectedVersion) throw new IntegrationError("A configuração mudou. Atualize a página.");
    if (connection && connection.agentId !== input.agentId) throw new IntegrationError("O vínculo do agente é permanente para impedir reatribuição entre operadores. Use o agente já associado.");
    if (connection && connection.enabled === input.enabled) return;
    if (connection?.version === 9999) throw new IntegrationError("Limite de alterações atingido.");
    const occupied = await tx.retellConnection.findUnique({ where: { agentId: input.agentId }, select: { organizationId: true } });
    if (occupied && occupied.organizationId !== context.organizationId) throw new IntegrationError("Agente indisponível para este vínculo.");
    // Unique(agentId) also defends concurrent allocation under different tenant locks.
    try {
      await tx.retellConnection.upsert({ where: { organizationId: context.organizationId }, create: { organizationId: context.organizationId, agentId: input.agentId, enabled: input.enabled }, update: { enabled: input.enabled, version: { increment: 1 }, checkResult: "NOT_CHECKED", checkedAt: null, checkToken: null, credentialHash: null } });
    } catch { throw new IntegrationError("Não foi possível associar o agente. Atualize e confira o vínculo."); }
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "retell.configured", metadata: { version: input.expectedVersion + 1, enabled: input.enabled } } });
  });
}
export async function verifyRetellConnection(organizationId: string, expectedVersion: number) {
  const context = await access(organizationId, "admin");
  const ticket = await getDb().$transaction(async tx => {
    await validate(tx, context, true);
    const row = await tx.retellConnection.findUnique({ where: { organizationId: context.organizationId } });
    if (!row || row.version !== expectedVersion) throw new IntegrationError("Guarde a configuração atual antes de verificar.");
    if (row.checkedAt && Date.now() - row.checkedAt.valueOf() < 60000) throw new IntegrationError("Aguarde um minuto antes de repetir a verificação.");
    const token = randomUUID();
    await tx.retellConnection.update({ where: { organizationId: context.organizationId }, data: { checkedAt: new Date(), checkResult: "CHECKING", checkToken: token, credentialHash: null } });
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "retell.check_started", metadata: { version: row.version } } });
    return { token, agentId: row.agentId, version: row.version };
  });
  const environment = retellEnvironment(), result = environment ? await checkRetellAgent(ticket.agentId, environment) : "MISSING_CONFIG";
  return getDb().$transaction(async tx => {
    await validate(tx, context, true);
    const changed = await tx.retellConnection.updateMany({ where: { organizationId: context.organizationId, version: ticket.version, checkToken: ticket.token }, data: { checkResult: result, checkToken: null, credentialHash: result === "API_OK" ? environment?.fingerprint : null } });
    if (changed.count !== 1) throw new IntegrationError("A configuração mudou durante a verificação. Verifique novamente.");
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "retell.check_completed", metadata: { result, version: ticket.version } } });
    return result;
  });
}
// Trusted ingress only: caller has authenticated exact raw bytes using the current server key.
export async function recordRetellEvent(event: { event: "call_started" | "call_ended" | "call_analyzed"; call: { agent_id: string; call_id: string } }, authenticatedFingerprint: string) {
  const db = getDb(), connection = await db.retellConnection.findUnique({ where: { agentId: event.call.agent_id }, select: { organizationId: true } });
  if (!connection) return;
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "organizationId" FROM "OperatorProfile" WHERE "organizationId" = ${connection.organizationId} FOR UPDATE`;
    const row = await tx.retellConnection.findUniqueOrThrow({ where: { organizationId: connection.organizationId } });
    if (!row.enabled || row.credentialHash !== authenticatedFingerprint || !proof(row)) return;
    const callHash = createHash("sha256").update(event.call.agent_id).update("\0").update(event.call.call_id).digest("hex");
    if (await tx.retellEvent.findUnique({ where: { organizationId_callHash_event: { organizationId: row.organizationId, callHash, event: event.event } } })) return;
    if (await tx.retellEvent.count({ where: { organizationId: row.organizationId } }) >= 5000) throw new IntegrationError("Limite de eventos de piloto atingido.");
    const now = new Date();
    await tx.retellEvent.create({ data: { organizationId: row.organizationId, callHash, event: event.event, receivedAt: now } });
    await tx.retellConnection.update({ where: { organizationId: row.organizationId }, data: { lastEventAt: now } });
  }, { timeout: 4000, maxWait: 2000 });
}
