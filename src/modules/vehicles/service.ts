import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { currentTenant, requirePermission } from "@/modules/auth";
import { CatalogConflict, catalogQuery, lockOperatorCatalog, recordVersion } from "@/modules/tenants";
import { vehicleInput } from "./domain";

export async function listVehicles(organizationId: string, raw: unknown = {}) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "organization:read");
  const query = catalogQuery.parse(raw);
  const where = { organizationId: context.organizationId, ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" as const } }, { registration: { contains: query.search.replace(/[ -]/g, "").toUpperCase() } }] } : {}), ...(query.active === "all" ? {} : { active: query.active === "active" }) };
  const [items, total] = await getDb().$transaction([
    getDb().vehicle.findMany({ where, take: 25, skip: (query.page - 1) * 25, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    getDb().vehicle.count({ where }),
  ]);
  return { items, total, page: query.page };
}

export async function getVehicle(organizationId: string, id: string) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "organization:read");
  return getDb().vehicle.findFirst({ where: { organizationId: context.organizationId, id } });
}

export async function createVehicle(organizationId: string, raw: unknown) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "resources:manage");
  const input = vehicleInput.parse(raw);
  try {
    return await getDb().$transaction(async (tx) => {
      await lockOperatorCatalog(tx, context.organizationId);
      const record = await tx.vehicle.create({ data: { organizationId: context.organizationId, ...input } });
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "vehicle.created", metadata: { resourceId: record.id, version: record.version } } });
      return record;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CatalogConflict();
    throw error;
  }
}

export async function updateVehicle(organizationId: string, id: string, expectedVersion: number, raw: unknown) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "resources:manage");
  const input = vehicleInput.parse(raw);
  recordVersion.parse(expectedVersion);
  try {
    await getDb().$transaction(async (tx) => {
      await lockOperatorCatalog(tx, context.organizationId);
      const changed = await tx.vehicle.updateMany({ where: { organizationId: context.organizationId, id, version: expectedVersion }, data: { ...input, version: { increment: 1 } } });
      if (changed.count !== 1) throw new CatalogConflict();
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "vehicle.updated", metadata: { resourceId: id, version: expectedVersion + 1 } } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CatalogConflict();
    throw error;
  }
}
