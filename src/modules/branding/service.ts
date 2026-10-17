import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { AccessDenied, currentTenant, requirePermission } from "@/modules/auth";
import { assertSandboxBookingApproval } from "@/modules/compliance";
import { recordVersion } from "@/modules/tenants";
import { brandInput, BrandError, type BrandIdentity } from "./domain";
import { brandIcons, normalizeLogo } from "./images";

const identitySelect = { displayName: true, primaryColor: true, secondaryColor: true, version: true, hasLogo: true } as const;
type TenantContext = Awaited<ReturnType<typeof currentTenant>>;
async function authorizeRead(organizationId: string) {
  const context = await currentTenant(organizationId);
  if (context.role === "DRIVER") {
    requirePermission(context, "assignments:own");
    if (!await getDb().driver.findFirst({ where: { organizationId: context.organizationId, userId: context.actorId, status: "ACTIVE" }, select: { id: true } })) throw new AccessDenied();
  } else requirePermission(context, "organization:read");
  return context;
}
async function lockOwner(tx: Prisma.TransactionClient, context: TenantContext) {
  await tx.$queryRaw`SELECT "organizationId" FROM "OperatorProfile" WHERE "organizationId" = ${context.organizationId} FOR UPDATE`;
  const member = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: context.organizationId, userId: context.actorId } }, include: { user: { select: { active: true } } } });
  if (!member?.active || member.role !== "OPERATOR_OWNER" || !member.user.active) throw new AccessDenied();
  await assertSandboxBookingApproval(tx, context.organizationId);
}
export async function readBrandIdentity(organizationId: string): Promise<BrandIdentity> {
  const context = await authorizeRead(organizationId);
  const organization = await getDb().organization.findUniqueOrThrow({ where: { id: context.organizationId }, select: { name: true, brand: { select: identitySelect } } });
  return organization.brand ? { ...brandInput.parse({ displayName: organization.brand.displayName, primaryColor: organization.brand.primaryColor, secondaryColor: organization.brand.secondaryColor }), version: organization.brand.version, hasLogo: organization.brand.hasLogo, generated: true } : { displayName: organization.name, primaryColor: "#124e66", secondaryColor: "#e0edf3", version: null, hasLogo: false, generated: false };
}
export async function generateWhiteLabel(organizationId: string) {
  const context = await currentTenant(organizationId);
  if (context.role !== "OPERATOR_OWNER") throw new AccessDenied();
  return getDb().$transaction(async tx => {
    await lockOwner(tx, context);
    const existing = await tx.brandProfile.findUnique({ where: { organizationId: context.organizationId }, select: identitySelect });
    if (existing) return existing;
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: context.organizationId }, select: { name: true } });
    const input = brandInput.parse({ displayName: organization.name.slice(0, 80), primaryColor: "#124e66", secondaryColor: "#e0edf3" });
    const brand = await tx.brandProfile.create({ data: { organizationId: context.organizationId, ...input, ...await brandIcons(input.primaryColor, null) }, select: identitySelect });
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "brand.generated", metadata: { version: 0, mode: "SANDBOX" } } });
    return brand;
  }, { timeout: 10000 });
}
export async function updateBrandIdentity(organizationId: string, version: number, raw: unknown, logoChange: { type: "KEEP" } | { type: "REMOVE" } | { type: "UPLOAD"; data: Uint8Array } = { type: "KEEP" }) {
  const context = await currentTenant(organizationId);
  if (context.role !== "OPERATOR_OWNER") throw new AccessDenied();
  recordVersion.parse(version); const input = brandInput.parse(raw);
  if (!["KEEP", "REMOVE", "UPLOAD"].includes(logoChange.type)) throw new BrandError("Alteração de logótipo inválida.");
  const uploaded = logoChange.type === "UPLOAD" ? await normalizeLogo(logoChange.data) : null;
  return getDb().$transaction(async tx => {
    await lockOwner(tx, context);
    const previous = await tx.brandProfile.findUnique({ where: { organizationId: context.organizationId } });
    if (!previous || previous.version !== version) throw new BrandError("A marca mudou ou ainda não foi gerada. Atualize a página.");
    const logo = logoChange.type === "UPLOAD" ? uploaded : logoChange.type === "REMOVE" ? null : previous.logo;
    const changed = await tx.brandProfile.updateMany({ where: { organizationId: context.organizationId, version }, data: { ...input, logo, hasLogo: Boolean(logo), ...await brandIcons(input.primaryColor, logo), version: { increment: 1 } } });
    if (changed.count !== 1) throw new BrandError("A marca mudou. Atualize a página.");
    await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.actorId, action: "brand.updated", metadata: { version: version + 1, logoChanged: logoChange.type !== "KEEP", mode: "SANDBOX" } } });
  }, { timeout: 10000 });
}
export async function readBrandAsset(organizationId: string, asset: "logo" | "icon192" | "icon512") {
  const context = await authorizeRead(organizationId);
  const brand = await getDb().brandProfile.findUnique({ where: { organizationId: context.organizationId }, select: { logo: true, icon192: true, icon512: true } });
  return brand?.[asset] ?? null;
}
