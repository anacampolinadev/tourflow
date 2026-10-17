import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { getDb } from "../src/lib/db";
import { AccessDenied } from "../src/modules/auth";
import { initializeAssistant, startAssistantSession, executeAssistantTool, readAssistantHandoffs } from "../src/modules/assistants";
import { actOnHandoff, readManagedOperations, readManagedCentral } from "../src/modules/managed-ops";
const suffix = randomUUID(), owner = `ops-owner-${suffix}`, admin = `ops-admin-${suffix}`, outsider = `ops-out-${suffix}`;
let org = "", other = "", handoff = "", conversation = "", call = "", requirement = "";
const orgs: string[] = [];
const action = (type: "CLAIM" | "RELEASE" | "RESOLVE" | "REOPEN", version: number, note = "") => actOnHandoff(org, handoff, "owner", { action: type, expectedVersion: version, note });
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required.");
  const db = getDb();
  await db.user.createMany({ data: [{ id: owner, email: `ops-owner-${suffix}@example.test` }, { id: admin, email: `ops-admin-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }, { id: outsider, email: `ops-out-${suffix}@example.test` }] });
  for (let n = 0; n < 2; n++) {
    const row = await db.organization.create({ data: { name: "Ops test", slug: `ops-${suffix}-${n}`, members: { create: { userId: owner, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: "test@example.test", contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "APPROVED", approvedAt: new Date(), approvedById: admin } } } });
    orgs.push(row.id);
    const req = await db.complianceRequirement.create({ data: { organizationId: row.id, title: "Ops document", requiresExpiry: true, documents: { create: { revision: 1, fileName: "test.pdf", mimeType: "application/pdf", size: 5, sha256: "test", data: Buffer.from("%PDF-"), uploadedById: owner, status: "APPROVED", expiresOn: new Date(Date.UTC(2090, 0, 1)) } } } });
    if (n === 0) requirement = req.id;
    session.userId = owner; await initializeAssistant(row.id);
  }
  [org, other] = [orgs[0]!, orgs[1]!];
});
beforeEach(async () => {
  session.userId = owner;
  await getDb().user.update({ where: { id: owner }, data: { active: true } });
  await getDb().organizationMember.update({ where: { organizationId_userId: { organizationId: org, userId: owner } }, data: { role: "OPERATOR_OWNER", active: true } });
  await getDb().operatorProfile.update({ where: { organizationId: org }, data: { status: "APPROVED" } });
  await getDb().complianceDocument.updateMany({ where: { requirementId: requirement }, data: { status: "APPROVED", expiresOn: new Date(Date.UTC(2090, 0, 1)) } });
  conversation = await startAssistantSession(org); call = randomUUID();
  const result = await executeAssistantTool(org, conversation, call, { tool: "handoff_to_human", input: { reason: "Private request for manual review" } });
  handoff = result.handoff!.id;
});
afterAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) return;
  const db = getDb(), where = { organizationId: { in: orgs } };
  await db.handoffEvent.deleteMany({ where }); await db.assistantToolCall.deleteMany({ where }); await db.assistantHandoff.deleteMany({ where }); await db.assistantConversation.deleteMany({ where });
  await db.assistantVersion.deleteMany({ where }); await db.assistantProfile.deleteMany({ where });
  await db.booking.deleteMany({ where }); await db.customer.deleteMany({ where }); await db.service.deleteMany({ where });
  await db.complianceReview.deleteMany({ where }); await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.auditLog.deleteMany({ where: { actorId: admin, organizationId: null } });
  await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: [owner, admin, outsider] } } }); await db.$disconnect();
});
describe("Managed private queue and health", () => {
  it("handles claim, resolution, reopen and immutable private history without notifications", async () => {
    expect(await action("CLAIM", 0)).toBe("IN_PROGRESS");
    expect(await action("RESOLVE", 1, "Reviewed with the operations team.")).toBe("RESOLVED");
    const done = await readManagedOperations(org, "owner", { status: "RESOLVED" });
    expect(done?.items.find(item => item.id === handoff)).toMatchObject({ version: 2, assignedToMe: true, events: [{ action: "RESOLVE", note: "Reviewed with the operations team." }, { action: "CLAIM", note: "" }] });
    expect(await action("REOPEN", 2)).toBe("OPEN");
    expect(await getDb().handoffEvent.count({ where: { handoffId: handoff } })).toBe(3);
    const audits = await getDb().auditLog.findMany({ where: { organizationId: org, action: "managed.handoff_changed" } });
    expect(JSON.stringify(audits)).not.toContain("Reviewed with");
    expect(JSON.stringify(audits)).not.toContain("Private request");
  });
  it("serializes concurrent duplicate submissions, rejects changed payload and never replays a historical mutation", async () => {
    expect(await Promise.all([action("CLAIM", 0), action("CLAIM", 0)])).toEqual(["IN_PROGRESS", "IN_PROGRESS"]);
    expect(await getDb().handoffEvent.count({ where: { handoffId: handoff } })).toBe(1);
    await action("RESOLVE", 1, "Resolved safely with the operator.");
    await expect(action("RESOLVE", 1, "A different resolution note entirely.")).rejects.toThrow("mudou");
    await action("REOPEN", 2);
    expect(await action("CLAIM", 0)).toBe("OPEN");
    expect((await getDb().assistantHandoff.findUniqueOrThrow({ where: { id: handoff } })).version).toBe(3);
  });
  it("returns the actual current handoff state to tool retries and omits resolved items from old pending queue", async () => {
    await action("CLAIM", 0); await action("RESOLVE", 1, "Resolved by the internal operations team.");
    const replay = await executeAssistantTool(org, conversation, call, { tool: "handoff_to_human", input: { reason: "Private request for manual review" } });
    expect(replay.handoff).toMatchObject({ status: "RESOLVED", notificationSent: false });
    expect((await readAssistantHandoffs(org)).some(item => item.id === handoff)).toBe(false);
  });
  it("denies cross-tenant references, outsider reads and implicit admin tenant access", async () => {
    await expect(actOnHandoff(other, handoff, "owner", { action: "CLAIM", expectedVersion: 0 })).rejects.toThrow("não encontrado");
    session.userId = outsider;
    await expect(readManagedOperations(org, "owner")).rejects.toBeInstanceOf(AccessDenied);
    await expect(readManagedCentral()).rejects.toBeInstanceOf(AccessDenied);
    await expect(actOnHandoff(org, handoff, "admin", { action: "CLAIM", expectedVersion: 0 })).rejects.toBeInstanceOf(AccessDenied);
    session.userId = admin;
    await expect(readManagedOperations(org, "owner")).rejects.toBeInstanceOf(AccessDenied);
    expect(await readManagedOperations(org, "admin")).not.toBeNull();
    expect(await getDb().auditLog.count({ where: { organizationId: org, actorId: admin, action: "admin.managed.read" } })).toBeGreaterThan(0);
  });
  it.each(["OPERATOR_VIEWER", "OPERATOR_DISPATCHER", "DRIVER"] as const)("denies private reasons and writes to %s", async role => {
    await getDb().organizationMember.update({ where: { organizationId_userId: { organizationId: org, userId: owner } }, data: { role } });
    await expect(readManagedOperations(org, "owner")).rejects.toBeInstanceOf(AccessDenied);
    await expect(action("CLAIM", 0)).rejects.toBeInstanceOf(AccessDenied);
  });
  it("allows handling existing exceptions while operator is suspended and session expired", async () => {
    await getDb().operatorProfile.update({ where: { organizationId: org }, data: { status: "SUSPENDED" } });
    await getDb().assistantConversation.update({ where: { id: conversation }, data: { createdAt: new Date(Date.now() - 48 * 3600000), expiresAt: new Date(Date.now() - 24 * 3600000) } });
    await action("CLAIM", 0); expect(await action("RESOLVE", 1, "Resolved through private operator contact.")).toBe("RESOLVED");
    expect((await readManagedOperations(org, "owner"))?.health.operatorStatus).toBe("SUSPENDED");
    expect((await getDb().operatorProfile.findUniqueOrThrow({ where: { organizationId: org } })).status).toBe("SUSPENDED");
  });
  it("requires the assignee to resolve; explicit admin may release a stuck claim", async () => {
    await action("CLAIM", 0); session.userId = admin;
    await expect(actOnHandoff(org, handoff, "admin", { action: "RESOLVE", expectedVersion: 1, note: "Must not override another assignee." })).rejects.toThrow("indisponível");
    await actOnHandoff(org, handoff, "admin", { action: "RELEASE", expectedVersion: 1 });
    await actOnHandoff(org, handoff, "admin", { action: "CLAIM", expectedVersion: 2 });
    expect(await actOnHandoff(org, handoff, "admin", { action: "RESOLVE", expectedVersion: 3, note: "Resolved by the managed administrator." })).toBe("RESOLVED");
  });
  it("calculates health from the latest document revision and performs no writes in owner reads", async () => {
    const db = getDb(), before = await db.auditLog.count({ where: { organizationId: org } });
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    await db.complianceDocument.updateMany({ where: { requirementId: requirement }, data: { expiresOn: today } });
    expect((await readManagedOperations(org, "owner"))?.health.documents).toContainEqual({ id: requirement, title: "Ops document", state: "EXPIRING" });
    await db.complianceDocument.create({ data: { organizationId: org, requirementId: requirement, revision: 2, fileName: "new.pdf", mimeType: "application/pdf", size: 5, sha256: "test", data: Buffer.from("%PDF-"), uploadedById: owner, status: "PENDING" } });
    expect((await readManagedOperations(org, "owner"))?.health.documents).toContainEqual({ id: requirement, title: "Ops document", state: "BLOCKED" });
    expect(await db.auditLog.count({ where: { organizationId: org } })).toBe(before);
  });
  it("paginates all items without losing full queue totals", async () => {
    const db = getDb();
    for (let i = 0; i < 21; i++) {
      const row = await db.assistantConversation.create({ data: { organizationId: org, actorId: owner, assistantVersion: 1, expiresAt: new Date(Date.now() + 3600000) } });
      await db.assistantHandoff.create({ data: { organizationId: org, conversationId: row.id, reason: `Pending request ${i}` } });
    }
    const first = await readManagedOperations(org, "owner"), next = await readManagedOperations(org, "owner", { page: 2 });
    expect(first?.items).toHaveLength(20); expect(first!.total).toBeGreaterThan(20);
    expect(first?.health.open).toBe(first?.total); expect(next?.total).toBe(first?.total);
    expect(next!.items.every(item => !first!.items.some(previous => previous.id === item.id))).toBe(true);
    session.userId = admin; const central = await readManagedCentral();
    expect(central.total).toBeGreaterThanOrEqual(2); expect(central.items.length).toBeLessThanOrEqual(20);
  });
  it("rejects a deactivated actor before altering the queue", async () => {
    await getDb().user.update({ where: { id: owner }, data: { active: false } });
    await expect(action("CLAIM", 0)).rejects.toBeInstanceOf(AccessDenied);
  });
  it("enforces state coherence and tenant boundaries in PostgreSQL", async () => {
    const db = getDb();
    await expect(db.assistantHandoff.update({ where: { id: handoff }, data: { status: "RESOLVED" } })).rejects.toThrow();
    await expect(db.handoffEvent.create({ data: { organizationId: other, handoffId: handoff, version: 1, action: "CLAIM", actorId: owner } })).rejects.toThrow();
    await expect(db.handoffEvent.create({ data: { organizationId: org, handoffId: handoff, version: 1, action: "RESOLVE", actorId: owner, note: "short" } })).rejects.toThrow();
  });
  it("rolls back status and history when audit persistence fails", async () => {
    const db = getDb(), name = `ops_fail_${suffix.replaceAll("-", "")}`;
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId" = '${org}' AND NEW."action" = 'managed.handoff_changed' THEN RAISE EXCEPTION 'fixture managed audit failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    try { await expect(action("CLAIM", 0)).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe(`DROP TRIGGER ${name} ON "AuditLog"`); await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`); }
    expect((await db.assistantHandoff.findUniqueOrThrow({ where: { id: handoff } })).version).toBe(0);
    expect(await db.handoffEvent.count({ where: { handoffId: handoff } })).toBe(0);
  });
  it("counts future refusals, near-term undispatched work and overdue execution without including completed or cancelled bookings", async () => {
    const db = getDb();
    const service = await db.service.create({ data: { organizationId: org, name: "Ops fixture tour", description: "", durationMinutes: 60, pricingType: "PER_GROUP", basePriceCents: 1000, capacity: 4, meetingPoint: "Station", languages: ["pt"] } });
    const customer = await db.customer.create({ data: { organizationId: org, name: "Fixture", email: "fixture@example.test", phone: "+351912345678" } });
    for (const [status, hours] of [["CONFIRMED", 2], ["CONFIRMED", 48], ["DRIVER_DECLINED", 48], ["ASSIGNED", -2], ["IN_PROGRESS", -2], ["COMPLETED", -2], ["CANCELLED", -2]] as const) {
      await db.booking.create({ data: { organizationId: org, serviceId: service.id, customerId: customer.id, idempotencyKey: randomUUID(), requestHash: "a".repeat(64), status, passengers: 1, startsAt: new Date(Date.now() + hours * 3600000), endsAt: new Date(Date.now() + (hours + 1) * 3600000), timeZone: "Europe/Lisbon", serviceName: "Ops fixture tour", pricingType: "PER_GROUP", unitPriceCents: 1000, totalPriceCents: 1000, currency: "EUR", meetingPoint: "Station", pickupRules: "", pickup: "", notes: "", source: "OPERATOR" } });
    }
    expect((await readManagedOperations(org, "owner"))?.health).toMatchObject({ declined: 1, unassigned: 1, overdue: 2 });
    expect((await readManagedOperations(other, "owner"))?.health).toMatchObject({ declined: 0, unassigned: 0, overdue: 0 });
  });
});
