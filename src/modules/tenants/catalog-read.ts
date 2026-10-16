import "server-only";
import { getDb } from "@/lib/db";
import { currentTenant, requirePermission } from "@/modules/auth";
import { assertCatalogWritable, CatalogUnavailable } from "./catalog-domain";
export async function readOperatorCatalog(organizationId: string) {
  const context = await currentTenant(organizationId);
  requirePermission(context, "organization:read");
  const organization = await getDb().organization.findUnique({ where: { id: context.organizationId }, select: { id: true, name: true, operator: { select: { status: true } } } });
  if (!organization?.operator) return null;
  let writable = true;
  try { assertCatalogWritable(organization.operator.status); } catch (error) { if (!(error instanceof CatalogUnavailable)) throw error; writable = false; }
  return { organization, context, writable };
}
