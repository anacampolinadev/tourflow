import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { getDb } from "../src/lib/db";
import { AccessDenied } from "../src/modules/auth";
import { initializeAssistant, readAssistant, updateAssistant } from "../src/modules/assistants";
import { generateWhiteLabel } from "../src/modules/branding";
import { runOperatorQa, readOperatorQa, recordManualQa } from "../src/modules/qa";
import { changeOperatorStatus } from "../src/modules/tenants";
import { requestCorrections } from "../src/modules/compliance";
const suffix = randomUUID(), actorId = `qa-owner-${suffix}`, outsider = `qa-admin-${suffix}`, driverUser = `qa-driver-${suffix}`;
const orgs: string[] = [];
let org = "", other = "", serviceId = "", vehicleId = "", driverId = "", requirementId = "";
const date = Temporal.Now.plainDateISO("Europe/Lisbon").add({ days: 15 }).toString();
const readyConfig = { operatorName: "Serra QA", assistantName: "Alana", tone: "WARM", languages: ["en"], openingHours: "09:00–18:00", policies: "Condições de teste do operador", faqs: "Perguntas de teste do operador", escalationName: "Equipa", escalationEmail: "qa-routing@example.test", escalationPhone: "" };
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required.");
  const db = getDb();
  await db.user.createMany({ data: [{ id: actorId, email: `booking-${suffix}@example.test`, platformRole: "USER" }, { id: outsider, email: `booking-out-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }] });
  for (let n = 0; n < 2; n++) {
    const row = await db.organization.create({ data: { name: "Booking test", slug: `booking-${suffix}-${n}`, members: { create: { userId: actorId, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: "test@example.test", contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, primaryLanguage: "en", status: "APPROVED", approvedAt: new Date(), approvedById: actorId } } } }); orgs.push(row.id);
  }
  org = orgs[0]!; other = orgs[1]!; session.userId = actorId;
  const requirement = await db.complianceRequirement.create({ data: { organizationId: org, title: "Test requirement", requiresExpiry: true, documents: { create: { revision: 1, fileName: "test.pdf", mimeType: "application/pdf", size: 5, sha256: "test", data: Buffer.from("%PDF-"), uploadedById: actorId, status: "APPROVED", expiresOn: new Date(`${date}T00:00Z`) } } } }); requirementId = requirement.id;
  await db.complianceRequirement.create({ data: { organizationId: other, title: "Other gate", documents: { create: { revision: 1, fileName: "test.pdf", mimeType: "application/pdf", size: 5, sha256: "test", data: Buffer.from("%PDF-"), uploadedById: actorId, status: "APPROVED" } } } });
  await initializeAssistant(org); await initializeAssistant(other); await generateWhiteLabel(org);
  serviceId = (await db.service.create({ data: { organizationId: org, name: "Booking Tour", description: "", durationMinutes: 120, pricingType: "PER_PERSON", basePriceCents: 4990, capacity: 6, meetingPoint: "Station", languages: ["en"], active: true } })).id;
  vehicleId = (await db.vehicle.create({ data: { organizationId: org, name: "Booking Jeep", type: "JEEP", registration: "BK001", capacity: 6, features: [], active: true } })).id;
  driverId = (await db.driver.create({ data: { organizationId: org, name: "Booking Driver", email: `driver-${suffix}@example.test`, phone: "+351912345678", languages: ["en"], status: "ACTIVE" } })).id;
  await db.user.create({ data: { id: driverUser, email: `qa-driver-${suffix}@example.test` } });
  await db.organizationMember.create({ data: { organizationId: org, userId: driverUser, role: "DRIVER" } });
  await db.driver.update({ where: { id: driverId }, data: { userId: driverUser } });
  await db.serviceVehicle.create({ data: { organizationId: org, serviceId, vehicleId } });
  for (const departureMinutes of [600, 720, 750, 840, 1020]) await db.serviceSchedule.create({ data: { organizationId: org, serviceId, weekday: Temporal.PlainDate.from(date).dayOfWeek, departureMinutes, validFrom: new Date(`${date}T00:00Z`), validUntil: new Date(`${date}T00:00Z`), bufferBeforeMinutes: 15, bufferAfterMinutes: 15 } });
  await db.driverAvailability.create({ data: { organizationId: org, driverId, startsAt: new Date(`${date}T00:00Z`), endsAt: new Date(`${date}T23:59Z`) } });
});
afterAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) return;
  const db = getDb(), where = { organizationId: { in: orgs } };
  await db.qaManualCheck.deleteMany({ where }); await db.qaRun.deleteMany({ where });
  await db.assistantToolCall.deleteMany({ where }); await db.assistantHandoff.deleteMany({ where }); await db.assistantConversation.deleteMany({ where });
  await db.brandProfile.deleteMany({ where });
  await db.assistantVersion.deleteMany({ where }); await db.assistantProfile.deleteMany({ where });
  await db.bookingEvent.deleteMany({ where }); await db.bookingOccupancy.deleteMany({ where }); await db.booking.deleteMany({ where }); await db.customer.deleteMany({ where });
  await db.resourceBlock.deleteMany({ where }); await db.driverAvailability.deleteMany({ where }); await db.serviceVehicle.deleteMany({ where }); await db.serviceSchedule.deleteMany({ where });
  await db.service.deleteMany({ where }); await db.vehicle.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.complianceReview.deleteMany({ where }); await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: [actorId, outsider, driverUser] } } }); await db.$disconnect();
});

beforeEach(async () => {
  session.userId = actorId;
  const db = getDb(), where = { organizationId: { in: orgs } };
  await db.qaManualCheck.deleteMany({ where }); await db.qaRun.deleteMany({ where });
  await db.assistantToolCall.deleteMany({ where }); await db.assistantHandoff.deleteMany({ where }); await db.assistantConversation.deleteMany({ where });
  await db.bookingEvent.deleteMany({ where }); await db.bookingOccupancy.deleteMany({ where }); await db.booking.deleteMany({ where }); await db.customer.deleteMany({ where });
  await db.operatorProfile.updateMany({ where, data: { status: "APPROVED", approvedAt: new Date(), approvedById: actorId } });
  await db.organizationMember.updateMany({ where: { ...where, userId: actorId }, data: { active: true, role: "OPERATOR_OWNER" } });
  await db.user.update({ where: { id: actorId }, data: { active: true } });
  await db.complianceDocument.updateMany({ where, data: { status: "APPROVED" } });
  await db.service.update({ where: { id: serviceId }, data: { version: 0 } });
  const profile = await readAssistant(org); await updateAssistant(org, profile!.version, readyConfig);
});

const residuals = async () => {
  const db = getDb(), where = { organizationId: org };
  return Promise.all([db.customer.count({ where }), db.booking.count({ where }), db.bookingOccupancy.count({ where }), db.bookingEvent.count({ where }), db.assistantConversation.count({ where }), db.assistantToolCall.count({ where }), db.assistantHandoff.count({ where })]);
};
const review = (revision = 0, decision = "BLOCKED") => ({ scenario: "NORMAL_BOOKING", expectedRevision: revision, decision, note: "Integração de conversação ainda indisponível para executar este cenário." });
describe("per-operator rollback-only sandbox QA", () => {
  it("executes real tools, persists 34 outcomes and only enters SANDBOX without leaving probe data", async () => {
    const before = await residuals(), profile = await getDb().operatorProfile.findUniqueOrThrow({ where: { organizationId: org } });
    const id = await runOperatorQa(org), result = await readOperatorQa(org, "owner", id);
    expect(result?.run).toMatchObject({ passed: 33, failed: 0, blocked: 0, internalReady: true, stale: false, productionReady: false });
    expect(result?.run?.checks).toHaveLength(34); expect(result?.run?.checks.find(item => item.key === "CONVERSATIONS")?.status).toBe("BLOCKED");
    expect(await residuals()).toEqual(before);
    const after = await getDb().operatorProfile.findUniqueOrThrow({ where: { organizationId: org } });
    expect(after).toMatchObject({ status: "SANDBOX", version: profile.version + 1, approvedAt: profile.approvedAt, approvedById: profile.approvedById });
    expect(await getDb().auditLog.count({ where: { organizationId: org, action: "qa.run_completed" } })).toBe(1);
    expect(await getDb().auditLog.count({ where: { organizationId: org, action: "assistant.booking_created" } })).toBe(0);
    expect(JSON.stringify(result?.run?.checks)).not.toContain("qa-sandbox@example.test");
  });
  it("reports preparation failures without publishing, fabricating conversation results or preserving probes", async () => {
    const config = await readAssistant(org); await updateAssistant(org, config!.version, { ...readyConfig, faqs: "", policies: "", escalationName: "", escalationEmail: "" });
    const before = await residuals(); const id = await runOperatorQa(org);
    const data = await readOperatorQa(org, "owner", id);
    expect(data?.run?.checks.find(item => item.key === "POLICIES")?.status).toBe("FAIL");
    expect(data?.run?.internalReady).toBe(false); expect(data?.productionReady).toBe(false); expect(await residuals()).toEqual(before);
  });
  it("enforces owner isolation, revoked identities and explicit audited administrator access", async () => {
    const id = await runOperatorQa(org);
    await expect(readOperatorQa(other, "owner", id)).rejects.toThrow("não encontrado");
    await expect(recordManualQa(org, id, review())).rejects.toBeInstanceOf(AccessDenied);
    for (const role of ["DRIVER", "OPERATOR_VIEWER", "OPERATOR_DISPATCHER"] as const) {
      await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: actorId }, data: { role } });
      await expect(runOperatorQa(org)).rejects.toBeInstanceOf(AccessDenied); await expect(readOperatorQa(org, "owner", id)).rejects.toBeInstanceOf(AccessDenied);
    }
    await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: actorId }, data: { role: "OPERATOR_OWNER", active: false } });
    await expect(readOperatorQa(org, "owner", id)).rejects.toBeInstanceOf(AccessDenied);
    await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: actorId }, data: { active: true } });
    await getDb().user.update({ where: { id: actorId }, data: { active: false } }); await expect(runOperatorQa(org)).rejects.toBeInstanceOf(AccessDenied);
    session.userId = null; await expect(readOperatorQa(org, "owner", id)).rejects.toBeInstanceOf(AccessDenied);
    session.userId = outsider; await expect(runOperatorQa(org)).rejects.toBeInstanceOf(AccessDenied);
    expect((await readOperatorQa(org, "admin", id))?.run?.id).toBe(id);
    expect(await getDb().auditLog.count({ where: { organizationId: org, action: "admin.qa.read", actorId: outsider } })).toBe(1);
    await expect(recordManualQa(other, id, review())).rejects.toThrow("não encontrado");
  });
  it("invalidates reports after configuration changes, expiry and documentary loss", async () => {
    const id = await runOperatorQa(org), config = await readAssistant(org);
    await updateAssistant(org, config!.version, { ...readyConfig, assistantName: "Sofia" });
    expect((await readOperatorQa(org, "owner", id))?.run).toMatchObject({ stale: true, internalReady: false });
    session.userId = outsider; await expect(recordManualQa(org, id, review())).rejects.toThrow("desatualizado");
    session.userId = actorId; const freshId = await runOperatorQa(org);
    await getDb().qaRun.update({ where: { id: freshId }, data: { createdAt: new Date(Date.now() - 48 * 3600000), expiresAt: new Date(Date.now() - 25 * 3600000) } });
    expect((await readOperatorQa(org, "owner", freshId))?.run?.stale).toBe(true);
    await getDb().complianceDocument.updateMany({ where: { requirementId }, data: { status: "EXPIRED" } });
    expect((await readOperatorQa(org, "owner"))?.canRun).toBe(false); await expect(runOperatorQa(org)).rejects.toThrow("aprovação documental");
  });
  it("preserves manual review revisions, rejects races and forbids approval without integrated conversations", async () => {
    const id = await runOperatorQa(org); session.userId = outsider;
    await expect(recordManualQa(org, id, review(0, "PASS"))).rejects.toThrow("Conversas reais");
    await recordManualQa(org, id, review());
    const results = await Promise.allSettled([recordManualQa(org, id, review(1, "FAIL")), recordManualQa(org, id, review(1))]);
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
    const rows = await getDb().qaManualCheck.findMany({ where: { organizationId: org, runId: id }, orderBy: { revision: "asc" } });
    expect(rows).toHaveLength(2); expect(rows[0]?.revision).toBe(1); expect(rows[0]?.note).toBe(review().note);
    const audit = await getDb().auditLog.findMany({ where: { organizationId: org, action: "qa.manual_recorded" } }); expect(JSON.stringify(audit)).not.toContain(review().note);
    expect((await readOperatorQa(org, "admin", id))?.productionReady).toBe(false);
  });
  it("rolls back report, status and all temporary tool mutations when report audit fails", async () => {
    const db = getDb(), before = await residuals(), name = `qa_test_${suffix.replaceAll("-", "")}`;
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId" = '${org}' AND NEW."action" = 'qa.run_completed' THEN RAISE EXCEPTION 'fixture report failure'; END IF; RETURN NEW; END $$`);
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      await expect(runOperatorQa(org)).rejects.toThrow(); expect(await residuals()).toEqual(before);
      expect(await db.qaRun.count({ where: { organizationId: org } })).toBe(0);
      expect((await db.operatorProfile.findUniqueOrThrow({ where: { organizationId: org } })).status).toBe("APPROVED");
    } finally { await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "AuditLog"`); await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`); }
  });
  it("allows admin documentary corrections from testing and invalidates the prior QA", async () => {
    const id = await runOperatorQa(org), profile = await getDb().operatorProfile.findUniqueOrThrow({ where: { organizationId: org } });
    session.userId = outsider; await requestCorrections(org, profile.version, "Rever os documentos antes de continuar os testes.");
    session.userId = actorId; const data = await readOperatorQa(org, "owner", id);
    expect(data?.run?.stale).toBe(true); expect(data?.canRun).toBe(false);
    expect((await getDb().operatorProfile.findUniqueOrThrow({ where: { organizationId: org } })).approvedAt).toBeNull();
  });
  it("allows admin suspension from SANDBOX while keeping client review and LIVE unavailable", async () => {
    await runOperatorQa(org); session.userId = outsider;
    const profile = await getDb().operatorProfile.findUniqueOrThrow({ where: { organizationId: org } });
    await expect(changeOperatorStatus(org, profile.version, "LIVE")).rejects.toThrow(); await expect(changeOperatorStatus(org, profile.version, "CLIENT_REVIEW")).rejects.toThrow();
    await changeOperatorStatus(org, profile.version, "SUSPENDED"); session.userId = actorId;
    expect((await readOperatorQa(org, "owner"))?.canRun).toBe(false); await expect(runOperatorQa(org)).rejects.toThrow();
  });
  it("bounds report storage without deleting history", async () => {
    const id = await runOperatorQa(org), db = getDb(), row = await db.qaRun.findUniqueOrThrow({ where: { id } });
    await db.qaRun.createMany({ data: Array.from({ length: 99 }, () => ({ organizationId: org, actorId, suiteVersion: row.suiteVersion, snapshotHash: row.snapshotHash, checks: row.checks!, createdAt: row.createdAt, expiresAt: row.expiresAt })) });
    await expect(runOperatorQa(org)).rejects.toThrow("100 relatórios"); expect(await db.qaRun.count({ where: { organizationId: org } })).toBe(100);
  });
});
