import "server-only";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, currentActor, requirePermission } from "@/modules/auth";
import { readOperatorCatalog } from "@/modules/tenants";
import { resourceKinds, type ResourceKind } from "@/types/operator-core";
export function resourceKind(raw: string) {
  const kind = resourceKinds.find((kind) => kind === raw);
  if (!kind) notFound();
  return kind;
}
export async function operatorCatalogPage(organizationId: string, kind: ResourceKind) {
  if (!(await currentActor())?.active) redirect("/login");
  const catalog = await readOperatorCatalog(organizationId).catch((error: unknown) => { if (error instanceof AccessDenied) notFound(); throw error; });
  if (!catalog) notFound();
  let canManage = catalog.writable;
  try { requirePermission(catalog.context, kind === "services" ? "catalog:manage" : "resources:manage"); } catch (error) { if (!(error instanceof AccessDenied)) throw error; canManage = false; }
  return { ...catalog, canManage };
}
