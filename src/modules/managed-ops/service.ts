import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { AccessDenied, currentTenant, requireCurrentSuperAdmin } from "@/modules/auth";
import { documentHealth, handoffInput, ManagedOpsError, nextHandoffState, queueInput } from "./domain";
export type ManagedScope = "owner" | "admin";
async function access(organizationId: string, scope: ManagedScope) {
  if (scope === "admin") return { actorId: (await requireCurrentSuperAdmin()).id, organizationId, admin: true };
  if (scope !== "owner") throw new AccessDenied();
  const context = await currentTenant(organizationId);
  if (context.role !== "OPERATOR_OWNER") throw new AccessDenied();
  return { actorId: context.actorId, organizationId: context.organizationId, admin: false };
}
async function revalidate(tx: Prisma.TransactionClient, context: Awaited<ReturnType<typeof access>>) {
  const user = await tx.user.findUnique({ where: { id: context.actorId }, select: { active: true, platformRole: true } });
  if (!user?.active) throw new AccessDenied();
  if (context.admin) { if (user.platformRole !== "SUPER_ADMIN") throw new AccessDenied(); return; }
  const member = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: context.organizationId, userId: context.actorId } } });
  if (!member?.active || member.role !== "OPERATOR_OWNER") throw new AccessDenied();
}
export async function actOnHandoff(organizationId: string, handoffId: string, scope: ManagedScope, raw: unknown) {
  const context = await access(organizationId, scope), input = handoffInput.parse(raw);
  return getDb().$transaction(async tx => {
    await tx.$queryRaw`SELECT "organizationId" FROM "OperatorProfile" WHERE "organizationId" = ${context.organizationId} FOR UPDATE`;
    await revalidate(tx, context);
    const handoff = await tx.assistantHandoff.findFirst({ where: { id: handoffId, organizationId: context.organizationId } });
    if (!handoff) throw new ManagedOpsError("Atendimento não encontrado.");
    // A repeated submission of the same version/action/note by the same actor is harmless.
    if (handoff.version !== input.expectedVersion) {
      const previous = await tx.handoffEvent.findFirst({ where: { organizationId: context.organizationId, handoffId, version: input.expectedVersion + 1, actorId: context.actorId, action: input.action, note: input.note } });
      if (previous) return handoff.status;
      throw new ManagedOpsError("O atendimento mudou. Atualize a página antes de tentar novamente.");
    }
    if (handoff.version >= 100) throw new ManagedOpsError("Limite de alterações atingido. Contacte a administração.");
    const status = nextHandoffState(handoff.status, handoff.assignedToId, context.actorId, context.admin, input.action);
    const changed = await tx.assistantHandoff.updateMany({ where: { id: handoffId, organizationId: context.organizationId, version: input.expectedVersion }, data: { status, version: { increment: 1 }, assignedToId: status === "OPEN" ? null : context.actorId, resolvedAt: status === "RESOLVED" ? new Date() : null } });
    if (changed.count !== 1) throw new ManagedOpsError("O atendimento mudou. Atualize a página.");
    await tx.handoffEvent.create({ data: { organizationId: context.organizationId, handoffId, version: handoff.version + 1, action: input.action, actorId: context.actorId, note: input.note } });
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "managed.handoff_changed", metadata: { handoffId, action: input.action, version: handoff.version + 1, status, scope, notificationSent: false } } });
    return status;
  });
}
async function health(tx: Prisma.TransactionClient, organizationId: string, now: Date) {
  const [operator, requirements, declined, unassigned, overdue, open, active] = await Promise.all([
    tx.operatorProfile.findUnique({ where: { organizationId }, select: { status: true, approvedAt: true, approvedById: true } }),
    tx.complianceRequirement.findMany({ where: { organizationId, active: true }, select: { id: true, title: true, requiresExpiry: true, documents: { orderBy: { revision: "desc" }, take: 1, select: { status: true, expiresOn: true } } } }),
    tx.booking.count({ where: { organizationId, status: "DRIVER_DECLINED", startsAt: { gte: now } } }),
    tx.booking.count({ where: { organizationId, status: "CONFIRMED", startsAt: { gte: now, lt: new Date(now.valueOf() + 24 * 3600000) } } }),
    tx.booking.count({ where: { organizationId, OR: [{ status: { in: ["CONFIRMED", "ASSIGNED", "DRIVER_ACCEPTED", "DRIVER_DECLINED", "ARRIVED"] }, startsAt: { lt: now } }, { status: "IN_PROGRESS", endsAt: { lt: now } }] } }),
    tx.assistantHandoff.count({ where: { organizationId, status: "OPEN" } }),
    tx.assistantHandoff.count({ where: { organizationId, status: "IN_PROGRESS" } }),
  ]);
  const documents = requirements.map(row => ({ id: row.id, title: row.title, state: documentHealth(row.documents[0]?.status, row.documents[0]?.expiresOn, now, row.requiresExpiry) })).filter(row => row.state !== "OK");
  return { operatorStatus: operator?.status ?? null, approvalMissing: !operator?.approvedAt || !operator.approvedById, documents, noRequirements: requirements.length === 0, declined, unassigned, overdue, open, active, checkedAt: now };
}
export async function readManagedOperations(organizationId: string, scope: ManagedScope, raw: unknown = {}) {
  const context = await access(organizationId, scope), query = queueInput.parse(raw);
  return getDb().$transaction(async tx => {
    await revalidate(tx, context);
    const organization = await tx.organization.findUnique({ where: { id: context.organizationId }, select: { name: true } });
    if (!organization) return null;
    const where = { organizationId: context.organizationId, status: query.status };
    const [state, total, items] = await Promise.all([
      health(tx, context.organizationId, new Date()), tx.assistantHandoff.count({ where }),
      tx.assistantHandoff.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (query.page - 1) * 20, take: 20, select: { id: true, reason: true, status: true, version: true, createdAt: true, resolvedAt: true, assignedToId: true, events: { orderBy: { version: "desc" }, select: { id: true, action: true, version: true, note: true, createdAt: true } } } }),
    ]);
    if (context.admin) await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "admin.managed.read", metadata: { status: query.status, page: query.page } } });
    return { organization, health: state, items: items.map(({ assignedToId, ...item }) => ({ ...item, assignedToMe: assignedToId === context.actorId })), total, ...query, admin: context.admin };
  }, { isolationLevel: "RepeatableRead" });
}
export async function readManagedCentral(rawPage: unknown = 1) {
  const actor = await requireCurrentSuperAdmin(), page = queueInput.shape.page.parse(rawPage);
  return getDb().$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: actor.id }, select: { active: true, platformRole: true } });
    if (!user?.active || user.platformRole !== "SUPER_ADMIN") throw new AccessDenied();
    const where = { operator: { isNot: null } };
    const total = await tx.organization.count({ where });
    const organizations = await tx.organization.findMany({ where, select: { id: true, name: true }, orderBy: { id: "asc" }, skip: (page - 1) * 20, take: 20 });
    const now = new Date(), items = [];
    for (const organization of organizations) items.push({ ...organization, health: await health(tx, organization.id, now) });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "admin.managed.central_read", metadata: { page } } });
    return { items, page, total, checkedAt: now };
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
}
