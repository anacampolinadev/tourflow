import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { currentTenant, requirePermission } from "@/modules/auth";
import { CatalogConflict, catalogQuery, lockOperatorCatalog, recordVersion } from "@/modules/tenants";
import { serviceInput } from "./domain";

export async function listServices(organizationId: string, raw: unknown = {}) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "organization:read");
  const query = catalogQuery.parse(raw);
  const where = { organizationId: context.organizationId, ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}), ...(query.active === "all" ? {} : { active: query.active === "active" }) };
  const [items, total] = await getDb().$transaction([
    getDb().service.findMany({ where, take: 25, skip: (query.page - 1) * 25, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    getDb().service.count({ where }),
  ]);
  return { items, total, page: query.page };
}

export async function getService(organizationId: string, id: string) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "organization:read");
  return getDb().service.findFirst({ where: { organizationId: context.organizationId, id } });
}

export async function createService(organizationId: string, raw: unknown) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "catalog:manage");
  const input = serviceInput.parse(raw);
  try {
    return await getDb().$transaction(async (tx) => {
      await lockOperatorCatalog(tx, context.organizationId);
      const record = await tx.service.create({ data: { organizationId: context.organizationId, ...input } });
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "service.created", metadata: { resourceId: record.id, version: record.version } } });
      return record;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CatalogConflict();
    throw error;
  }
}

export async function updateService(organizationId: string, id: string, expectedVersion: number, raw: unknown) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "catalog:manage");
  const input = serviceInput.parse(raw);
  recordVersion.parse(expectedVersion);
  try {
    await getDb().$transaction(async (tx) => {
      await lockOperatorCatalog(tx, context.organizationId);
      const changed = await tx.service.updateMany({ where: { organizationId: context.organizationId, id, version: expectedVersion }, data: { ...input, version: { increment: 1 } } });
      if (changed.count !== 1) throw new CatalogConflict();
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "service.updated", metadata: { resourceId: id, version: expectedVersion + 1 } } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CatalogConflict();
    throw error;
  }
}
