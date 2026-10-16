import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { assertCatalogWritable, CatalogUnavailable } from "./catalog-domain";
// Lock the tenant root so suspension and catalog writes cannot cross in flight.
// This does not modify the compliance version or approval markers.
export async function lockOperatorCatalog(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$queryRaw`SELECT "organizationId" FROM "OperatorProfile" WHERE "organizationId" = ${organizationId} FOR UPDATE`;
  const profile = await tx.operatorProfile.findUnique({ where: { organizationId }, select: { status: true } });
  if (!profile) throw new CatalogUnavailable();
  assertCatalogWritable(profile.status);
}
