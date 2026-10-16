import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { currentTenant, requirePermission } from "@/modules/auth";
import { CatalogConflict, catalogQuery, lockOperatorCatalog, recordVersion } from "@/modules/tenants";
import { driverInput, transitionDriver } from "./domain";

export async function listDrivers(organizationId: string, raw: unknown = {}) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "organization:read");
  const query = catalogQuery.parse(raw);
  const where = { organizationId: context.organizationId, ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}), ...(query.active === "all" ? {} : { status: query.active === "active" ? "ACTIVE" as const : { not: "ACTIVE" as const } }) };
  const [items, total] = await getDb().$transaction([
    getDb().driver.findMany({ where, take: 25, skip: (query.page - 1) * 25, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    getDb().driver.count({ where }),
  ]);
  return { items, total, page: query.page };
}

export async function getDriver(organizationId: string, id: string) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "organization:read");
  return getDb().driver.findFirst({ where: { organizationId: context.organizationId, id } });
}

export async function createDriver(organizationId: string, raw: unknown) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "resources:manage");
  const input = driverInput.parse(raw);
  try {
    return await getDb().$transaction(async (tx) => {
      await lockOperatorCatalog(tx, context.organizationId);
      const record = await tx.driver.create({ data: { organizationId: context.organizationId, ...input } });
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "driver.created", metadata: { resourceId: record.id, version: record.version } } });
      return record;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CatalogConflict();
    throw error;
  }
}

export async function updateDriver(organizationId: string, id: string, expectedVersion: number, raw: unknown) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "resources:manage");
  const input = driverInput.parse(raw);
  recordVersion.parse(expectedVersion);
  try {
    await getDb().$transaction(async (tx) => {
      await lockOperatorCatalog(tx, context.organizationId);
      const changed = await tx.driver.updateMany({ where: { organizationId: context.organizationId, id, version: expectedVersion }, data: { ...input, version: { increment: 1 } } });
      if (changed.count !== 1) throw new CatalogConflict();
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "driver.updated", metadata: { resourceId: id, version: expectedVersion + 1 } } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CatalogConflict();
    throw error;
  }
}

export async function changeDriverStatus(organizationId: string, id: string, expectedVersion: number, rawStatus: unknown) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "resources:manage");
  recordVersion.parse(expectedVersion);
  await getDb().$transaction(async (tx) => {
    await lockOperatorCatalog(tx, context.organizationId);
    const record = await tx.driver.findFirst({ where: { organizationId: context.organizationId, id, version: expectedVersion } });
    if (!record) throw new CatalogConflict();
    const next = transitionDriver(record.status, rawStatus);
    const changed = await tx.driver.updateMany({ where: { organizationId: context.organizationId, id, version: expectedVersion }, data: { status: next, version: { increment: 1 } } });
    if (changed.count !== 1) throw new CatalogConflict();
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "driver.status.changed", metadata: { resourceId: id, from: record.status, to: next, version: expectedVersion + 1 } } });
  });
}
