import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { currentTenant, requireCurrentActor, requireCurrentSuperAdmin, requirePermission } from "@/modules/auth";
import { createOperatorInput, operatorInput, OperatorConflict, statusInput } from "./input";
import { transitionOperator, type OperatorStatus } from "./status";

export async function listMyOrganizations() {
  const actor = await requireCurrentActor();
  return getDb().organizationMember.findMany({ where: { userId: actor.id, active: true }, select: { organizationId: true, role: true, organization: { select: { name: true } } }, orderBy: { organization: { name: "asc" } } });
}

export async function readMyOrganization(organizationId: string) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "organization:read");
  return getDb().organization.findFirst({ where: { id: context.organizationId }, select: { id: true, name: true } });
}

export async function listOperators(options: { search?: string; status?: string; page?: number } = {}) {
  const actor = await requireCurrentSuperAdmin();
  const search = options.search?.trim().slice(0, 120);
  const status = options.status ? statusInput.parse(options.status) : undefined;
  const page = Number.isSafeInteger(options.page) && (options.page ?? 0) > 0 ? Math.min(options.page ?? 1, 10000) : 1;
  const where: Prisma.OrganizationWhereInput = {
    operator: { is: status ? { status } : {} },
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
  };
  return getDb().$transaction(async (tx) => {
    const [organizations, total] = await Promise.all([
      tx.organization.findMany({ where, include: { operator: true }, take: 25, skip: (page - 1) * 25, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }),
      tx.organization.count({ where }),
    ]);
    await tx.auditLog.create({ data: { actorId: actor.id, action: "admin.operator.list", metadata: { page, filtered: Boolean(search || status) } } });
    return { organizations, total, page };
  });
}

export async function getOperator(organizationId: string) {
  const actor = await requireCurrentSuperAdmin();
  return getDb().$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({ where: { id: organizationId }, include: { operator: true } });
    if (organization?.operator) await tx.auditLog.create({ data: { actorId: actor.id, organizationId, action: "admin.operator.read", metadata: {} } });
    return organization;
  });
}

export async function createOperator(raw: unknown) {
  const actor = await requireCurrentSuperAdmin();
  const input = createOperatorInput.parse(raw);
  const { name, slug, ...profile } = input;
  try {
    return await getDb().$transaction(async (tx) => {
      const user = await tx.user.upsert({ where: { email: input.contactEmail }, create: { email: input.contactEmail, name: input.responsibleName }, update: {} });
      if (!user.active) throw new OperatorConflict();
      const organization = await tx.organization.create({ data: { name, slug, operator: { create: profile }, members: { create: { userId: user.id, role: "OPERATOR_OWNER" } } } });
      await tx.auditLog.create({ data: { organizationId: organization.id, actorId: actor.id, action: "operator.created", metadata: { status: "LEAD" } } });
      return organization;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new OperatorConflict();
    throw error;
  }
}

export async function updateOperator(organizationId: string, expectedVersion: number, raw: unknown) {
  const actor = await requireCurrentSuperAdmin();
  const { name, ...profile } = operatorInput.parse(raw);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new OperatorConflict();
  await getDb().$transaction(async (tx) => {
    const current = await tx.operatorProfile.findUnique({ where: { organizationId }, include: { organization: { select: { name: true } } } });
    if (!current || current.version !== expectedVersion) throw new OperatorConflict();
    if (!["LEAD", "CONTRACTED", "ONBOARDING", "DOCS_PENDING", "SUSPENDED"].includes(current.status) && (name !== current.organization.name || profile.responsibleName !== current.responsibleName || profile.contactEmail !== current.contactEmail)) throw new OperatorConflict();
    const changed = await tx.operatorProfile.updateMany({ where: { organizationId, version: expectedVersion }, data: { ...profile, version: { increment: 1 } } });
    if (changed.count !== 1) throw new OperatorConflict();
    await tx.organization.update({ where: { id: organizationId }, data: { name } });
    // Contact changes do not silently transfer account ownership or elevate another user.
    await tx.auditLog.create({ data: { organizationId, actorId: actor.id, action: "operator.updated", metadata: { version: expectedVersion + 1 } } });
  });
}

export async function changeOperatorStatus(organizationId: string, expectedVersion: number, rawStatus: unknown) {
  const actor = await requireCurrentSuperAdmin();
  const next = statusInput.parse(rawStatus);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new OperatorConflict();
  await getDb().$transaction(async (tx) => {
    const current = await tx.operatorProfile.findUnique({ where: { organizationId } });
    if (!current || current.version !== expectedVersion) throw new OperatorConflict();
    transitionOperator(current.status, next);
    const changed = await tx.operatorProfile.updateMany({ where: { organizationId, version: expectedVersion, status: current.status }, data: { status: next, version: { increment: 1 } } });
    if (changed.count !== 1) throw new OperatorConflict();
    await tx.auditLog.create({ data: { organizationId, actorId: actor.id, action: "operator.status.changed", metadata: { from: current.status, to: next } } });
  });
}

export type { OperatorStatus };
