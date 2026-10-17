import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { getDb } from "../src/lib/db";
import { AccessDenied } from "../src/modules/auth";
import { generateWhiteLabel, updateBrandIdentity, readBrandIdentity, readBrandAsset } from "../src/modules/branding";
const suffix = randomUUID(), owner = `brand-${suffix}`, outsider = `brand-out-${suffix}`, driverUser = `brand-driver-${suffix}`;
const orgs: string[] = []; let org = "", other = "", driverId = "";
const input = { displayName: "Serra Premium", primaryColor: "#773399", secondaryColor: "#ffeecc" };
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required.");
  const db = getDb();
  await db.user.createMany({ data: [{ id: owner, email: `brand-${suffix}@example.test` }, { id: outsider, email: `brand-out-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }, { id: driverUser, email: `brand-driver-${suffix}@example.test` }] });
  for (let index = 0; index < 2; index++) {
    const row = await db.organization.create({ data: { name: `Brand fixture ${index}`, slug: `brand-${suffix}-${index}`, members: { create: { userId: owner, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: "test@example.test", contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "APPROVED", approvedAt: new Date(), approvedById: owner } } } }); orgs.push(row.id);
    await db.complianceRequirement.create({ data: { organizationId: row.id, title: "Approval fixture", documents: { create: { revision: 1, fileName: "private.pdf", mimeType: "application/pdf", size: 5, sha256: "fixture", data: Buffer.from("%PDF-"), uploadedById: owner, status: "APPROVED" } } } });
  }
  org = orgs[0]!; other = orgs[1]!;
  await db.organizationMember.create({ data: { organizationId: org, userId: driverUser, role: "DRIVER" } });
  driverId = (await db.driver.create({ data: { organizationId: org, userId: driverUser, name: "Driver fixture", email: `brand-driver-${suffix}@example.test`, phone: "+351912345678", languages: ["pt"], status: "ACTIVE" } })).id;
});
beforeEach(async () => {
  const db = getDb(); session.userId = owner;
  await db.brandProfile.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { role: "OPERATOR_OWNER", active: true } });
  await db.organizationMember.updateMany({ where: { organizationId: org, userId: driverUser }, data: { active: true } });
  await db.user.update({ where: { id: owner }, data: { active: true } });
  await db.driver.update({ where: { id: driverId }, data: { status: "ACTIVE" } });
  await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: owner } });
  await db.complianceDocument.updateMany({ where: { organizationId: org }, data: { status: "APPROVED" } });
});
afterAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) return;
  const db = getDb(), where = { organizationId: { in: orgs } };
  await db.brandProfile.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: [owner, outsider, driverUser] } } }); await db.$disconnect();
});
describe("private white-label configuration factory", () => {
  it("keeps fallback reads free of writes and generates once under concurrent/repeated calls", async () => {
    const db = getDb(); expect(await readBrandIdentity(org)).toMatchObject({ generated: false, displayName: "Brand fixture 0" });
    expect(await db.brandProfile.count({ where: { organizationId: org } })).toBe(0);
    const root = await db.operatorProfile.findUniqueOrThrow({ where: { organizationId: org } });
    const before = await Promise.all([db.user.count(), db.driver.count({ where: { organizationId: org } }), db.service.count({ where: { organizationId: org } })]);
    const [first, second] = await Promise.all([generateWhiteLabel(org), generateWhiteLabel(org)]); expect(first).toEqual(second);
    await updateBrandIdentity(org, 0, input); expect((await generateWhiteLabel(org)).displayName).toBe(input.displayName);
    expect(await db.auditLog.count({ where: { organizationId: org, action: "brand.generated" } })).toBe(1);
    expect(await db.operatorProfile.findUniqueOrThrow({ where: { organizationId: org } })).toEqual(root);
    expect(await Promise.all([db.user.count(), db.driver.count({ where: { organizationId: org } }), db.service.count({ where: { organizationId: org } })])).toEqual(before);
  });
  it("blocks unapproved/expired/restricted/LIVE generation and editing without changing the prior identity", async () => {
    const db = getDb(); await generateWhiteLabel(org);
    for (const status of ["ONBOARDING", "UNDER_REVIEW", "RESTRICTED", "SUSPENDED", "LIVE"] as const) {
      await db.operatorProfile.update({ where: { organizationId: org }, data: { status } });
      await expect(updateBrandIdentity(org, 0, input)).rejects.toThrow(); await expect(generateWhiteLabel(org)).rejects.toThrow();
    }
    await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "APPROVED" } });
    await db.complianceDocument.updateMany({ where: { organizationId: org }, data: { status: "EXPIRED" } });
    await expect(updateBrandIdentity(org, 0, input)).rejects.toThrow();
    expect((await readBrandIdentity(org)).version).toBe(0);
  });
  it("denies foreign/global-admin access and requires an owner for writes while viewers can read", async () => {
    await generateWhiteLabel(org);
    for (const actor of [null, outsider]) { session.userId = actor; await expect(readBrandIdentity(org)).rejects.toBeInstanceOf(AccessDenied); await expect(readBrandAsset(org, "icon192")).rejects.toBeInstanceOf(AccessDenied); await expect(generateWhiteLabel(org)).rejects.toBeInstanceOf(AccessDenied); }
    session.userId = owner;
    for (const role of ["OPERATOR_DISPATCHER", "OPERATOR_VIEWER"] as const) {
      await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { role } });
      expect((await readBrandIdentity(org)).generated).toBe(true);
      await expect(generateWhiteLabel(org)).rejects.toBeInstanceOf(AccessDenied); await expect(updateBrandIdentity(org, 0, input)).rejects.toBeInstanceOf(AccessDenied);
    }
  });
  it("scopes colours and bytes by organization and grants only active linked drivers read access", async () => {
    await generateWhiteLabel(org); await generateWhiteLabel(other); await updateBrandIdentity(org, 0, input);
    expect((await readBrandIdentity(other)).displayName).toBe("Brand fixture 1");
    expect(Buffer.from((await readBrandAsset(org, "icon192"))!).equals(Buffer.from((await readBrandAsset(other, "icon192"))!))).toBe(false);
    session.userId = driverUser; expect((await readBrandIdentity(org)).displayName).toBe(input.displayName);
    await expect(readBrandIdentity(other)).rejects.toBeInstanceOf(AccessDenied); await expect(updateBrandIdentity(org, 1, input)).rejects.toBeInstanceOf(AccessDenied);
    await getDb().driver.update({ where: { id: driverId }, data: { status: "SUSPENDED" } }); await expect(readBrandAsset(org, "icon192")).rejects.toBeInstanceOf(AccessDenied);
    await getDb().driver.update({ where: { id: driverId }, data: { status: "ACTIVE" } });
    await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: driverUser }, data: { active: false } }); await expect(readBrandIdentity(org)).rejects.toBeInstanceOf(AccessDenied);
  });
  it("normalizes uploads, retains/removes the logo explicitly, and rejects stale or simultaneous edits", async () => {
    const db = getDb(); await generateWhiteLabel(org);
    const image = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#dd2299" } }).png().toBuffer();
    await updateBrandIdentity(org, 0, input, { type: "UPLOAD", data: image });
    const logo = await readBrandAsset(org, "logo"); expect(logo).not.toBeNull(); expect((await readBrandIdentity(org)).hasLogo).toBe(true);
    const results = await Promise.allSettled([updateBrandIdentity(org, 1, { ...input, displayName: "Winner one" }), updateBrandIdentity(org, 1, { ...input, displayName: "Winner two" })]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1); expect(await readBrandAsset(org, "logo")).toEqual(logo);
    await expect(updateBrandIdentity(org, 1, input)).rejects.toThrow("mudou");
    await updateBrandIdentity(org, 2, input, { type: "REMOVE" }); expect(await readBrandAsset(org, "logo")).toBeNull();
    expect((await readBrandIdentity(org)).hasLogo).toBe(false); expect(await db.brandProfile.count({ where: { organizationId: org } })).toBe(1);
  });
  it("rolls back identity and assets when audit persistence fails", async () => {
    const db = getDb(); await generateWhiteLabel(org); const before = await db.brandProfile.findUniqueOrThrow({ where: { organizationId: org } });
    const name = `brand_test_${suffix.replaceAll("-", "")}`;
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId" = '${org}' AND NEW."action" = 'brand.updated' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$`);
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      await expect(updateBrandIdentity(org, 0, input)).rejects.toThrow(); expect(await db.brandProfile.findUniqueOrThrow({ where: { organizationId: org } })).toEqual(before);
    } finally { await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "AuditLog"`); await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`); }
  });
});
