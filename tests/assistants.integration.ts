import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { getDb } from "../src/lib/db";
import { AccessDenied } from "../src/modules/auth";
import { initializeAssistant, updateAssistant, readAssistant } from "../src/modules/assistants";
const suffix = randomUUID(), owner = `assistant-${suffix}`, outsider = `assistant-out-${suffix}`, driverUser = `assistant-driver-${suffix}`;
const orgs: string[] = []; let org = "", other = "", driverId = "";
const input = { operatorName: "Serra Premium", assistantName: "Sofia", tone: "FORMAL", languages: ["pt", "en"], openingHours: "09:00–18:00", policies: "Contacte o responsável para exceções.", faqs: "Como chegar? Consulte os detalhes do serviço.", escalationName: "João", escalationEmail: "private@example.test", escalationPhone: "+351912345678" };
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required.");
  const db = getDb();
  await db.user.createMany({ data: [{ id: owner, email: `assistant-${suffix}@example.test` }, { id: outsider, email: `assistant-out-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }, { id: driverUser, email: `assistant-driver-${suffix}@example.test` }] });
  for (let index = 0; index < 2; index++) {
    const row = await db.organization.create({ data: { name: `Brand fixture ${index}`, slug: `assistant-${suffix}-${index}`, members: { create: { userId: owner, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: "test@example.test", contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "APPROVED", approvedAt: new Date(), approvedById: owner } } } }); orgs.push(row.id);
    await db.complianceRequirement.create({ data: { organizationId: row.id, title: "Approval fixture", documents: { create: { revision: 1, fileName: "private.pdf", mimeType: "application/pdf", size: 5, sha256: "fixture", data: Buffer.from("%PDF-"), uploadedById: owner, status: "APPROVED" } } } });
  }
  org = orgs[0]!; other = orgs[1]!;
  await db.organizationMember.create({ data: { organizationId: org, userId: driverUser, role: "DRIVER" } });
  driverId = (await db.driver.create({ data: { organizationId: org, userId: driverUser, name: "Driver fixture", email: `assistant-driver-${suffix}@example.test`, phone: "+351912345678", languages: ["pt"], status: "ACTIVE" } })).id;
});
beforeEach(async () => {
  const db = getDb(); session.userId = owner;
  await db.assistantVersion.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.assistantProfile.deleteMany({ where: { organizationId: { in: orgs } } });
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
  await db.assistantVersion.deleteMany({ where }); await db.assistantProfile.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: [owner, outsider, driverUser] } } }); await db.$disconnect();
});
describe("tenant assistant configuration", () => {
  it("reads without writes, initializes once concurrently and never resets personalizations or root gates", async () => {
    const db = getDb(), root = await db.operatorProfile.findUniqueOrThrow({ where: { organizationId: org } });
    expect(await readAssistant(org)).toBeNull();
    expect(await db.assistantProfile.count({ where: { organizationId: org } })).toBe(0);
    expect(await Promise.all([initializeAssistant(org), initializeAssistant(org)])).toEqual([1, 1]);
    await updateAssistant(org, 1, input); expect(await initializeAssistant(org)).toBe(2);
    const data = await readAssistant(org); expect(data?.selected.configuration.assistantName).toBe("Sofia");
    expect(data?.history).toHaveLength(2);
    expect(await db.auditLog.count({ where: { organizationId: org, action: "assistant.initialized" } })).toBe(1);
    expect(await db.operatorProfile.findUniqueOrThrow({ where: { organizationId: org } })).toEqual(root);
    expect(await db.booking.count({ where: { organizationId: org } })).toBe(0);
  });
  it("denies anonymous, other-tenant and global admin access plus non-owner/revoked accounts", async () => {
    await initializeAssistant(org);
    for (const userId of [null, outsider, driverUser]) {
      session.userId = userId;
      await expect(readAssistant(org)).rejects.toBeInstanceOf(AccessDenied);
      await expect(initializeAssistant(org)).rejects.toBeInstanceOf(AccessDenied);
      await expect(updateAssistant(org, 1, input)).rejects.toBeInstanceOf(AccessDenied);
    }
    session.userId = owner;
    for (const role of ["OPERATOR_VIEWER", "OPERATOR_DISPATCHER"] as const) {
      await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { role } });
      await expect(readAssistant(org)).rejects.toBeInstanceOf(AccessDenied);
      await expect(updateAssistant(org, 1, input)).rejects.toBeInstanceOf(AccessDenied);
    }
    await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { role: "OPERATOR_OWNER", active: false } });
    await expect(readAssistant(org)).rejects.toBeInstanceOf(AccessDenied);
    await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { active: true } });
    await getDb().user.update({ where: { id: owner }, data: { active: false } });
    await expect(updateAssistant(org, 1, input)).rejects.toBeInstanceOf(AccessDenied);
  });
  it("keeps saved history isolated and immutable, redacts contacts from instructions/audit and rejects missing revisions", async () => {
    await initializeAssistant(org); await initializeAssistant(other);
    await updateAssistant(org, 1, input);
    expect((await readAssistant(org, 1))?.selected.configuration.assistantName).toBe("Alana");
    expect((await readAssistant(other))?.selected.configuration.assistantName).toBe("Alana");
    const current = await readAssistant(org);
    expect(current?.selected.instructions).toContain('"assistantName":"Sofia"');
    expect(current?.selected.instructions).not.toContain("private@example.test");
    expect(JSON.stringify(await getDb().auditLog.findMany({ where: { organizationId: org, action: { startsWith: "assistant." } } }))).not.toContain("private@example.test");
    await expect(readAssistant(other, 2)).rejects.toThrow("não encontrada");
    await expect(readAssistant(org, 0)).rejects.toThrow();
  });
  it("requires valid documentary approval even for repeated initialization and keeps changes atomic", async () => {
    await initializeAssistant(org);
    const db = getDb();
    for (const status of ["ONBOARDING", "UNDER_REVIEW", "RESTRICTED", "SUSPENDED", "LIVE"] as const) {
      await db.operatorProfile.update({ where: { organizationId: org }, data: { status } });
      await expect(initializeAssistant(org)).rejects.toThrow(); await expect(updateAssistant(org, 1, input)).rejects.toThrow();
    }
    await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "APPROVED" } });
    await db.complianceDocument.updateMany({ where: { organizationId: org }, data: { status: "EXPIRED" } });
    await expect(updateAssistant(org, 1, input)).rejects.toThrow();
    expect((await readAssistant(org))?.version).toBe(1);
  });
  it("allows exactly one simultaneous edit and preserves the losing draft as unsaved", async () => {
    await initializeAssistant(org);
    const results = await Promise.allSettled([updateAssistant(org, 1, input), updateAssistant(org, 1, { ...input, assistantName: "Marta" })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await readAssistant(org))?.history).toHaveLength(2);
    await expect(updateAssistant(org, 1, input)).rejects.toThrow("mudou");
  });
  it("caps history without deleting old versions and rejects invalid configuration before persistence", async () => {
    await initializeAssistant(org);
    await expect(updateAssistant(org, 1, { ...input, languages: ["fr"] })).rejects.toThrow();
    expect((await readAssistant(org))?.version).toBe(1);
    await getDb().assistantProfile.update({ where: { organizationId: org }, data: { version: 100 } });
    await expect(updateAssistant(org, 100, input)).rejects.toThrow("100 versões");
    expect(await getDb().assistantVersion.count({ where: { organizationId: org } })).toBe(1);
    await expect(getDb().assistantProfile.update({ where: { organizationId: org }, data: { version: 101 } })).rejects.toThrow();
  });
  it("rolls back profile and historical version when audit fails", async () => {
    await initializeAssistant(org);
    const db = getDb(), before = await readAssistant(org), name = `assistant_test_${suffix.replaceAll("-", "")}`;
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId" = '${org}' AND NEW."action" = 'assistant.updated' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$`);
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      await expect(updateAssistant(org, 1, input)).rejects.toThrow(); expect(await readAssistant(org)).toEqual(before);
    } finally { await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "AuditLog"`); await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`); }
  });
});
