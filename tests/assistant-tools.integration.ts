import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { getDb } from "../src/lib/db";
import { AccessDenied } from "../src/modules/auth";
import { createBooking, cancelBooking } from "../src/modules/bookings";
import { initializeAssistant, updateAssistant, readAssistant, startAssistantSession, executeAssistantTool, readAssistantHandoffs, readAssistantSession } from "../src/modules/assistants";
import { PLAYBOOK_VERSION } from "../src/modules/assistants/domain";
const suffix = randomUUID(), actorId = `tools-owner-${suffix}`, outsider = `tools-out-${suffix}`;
const orgs: string[] = [];
let org = "", other = "", serviceId = "", vehicleId = "", driverId = "", requirementId = "";
const date = Temporal.Now.plainDateISO("Europe/Lisbon").add({ days: 15 }).toString();
const request = (time = "10:00") => ({ serviceId, serviceVersion: 0, date, time, passengers: 4, language: "en", customerName: "Private Customer", customerEmail: "private@example.test", customerPhone: "+351912345678", pickup: "" });
const run = (conversationId: string, tool: string, input: unknown, callId = randomUUID()) => executeAssistantTool(org, conversationId, callId, { tool, input });
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required.");
  const db = getDb();
  await db.user.createMany({ data: [{ id: actorId, email: `booking-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }, { id: outsider, email: `booking-out-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }] });
  for (let n = 0; n < 2; n++) {
    const row = await db.organization.create({ data: { name: "Booking test", slug: `booking-${suffix}-${n}`, members: { create: { userId: actorId, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: "test@example.test", contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, primaryLanguage: "en", status: "APPROVED", approvedAt: new Date(), approvedById: actorId } } } }); orgs.push(row.id);
  }
  org = orgs[0]!; other = orgs[1]!; session.userId = actorId;
  const requirement = await db.complianceRequirement.create({ data: { organizationId: org, title: "Test requirement", requiresExpiry: true, documents: { create: { revision: 1, fileName: "test.pdf", mimeType: "application/pdf", size: 5, sha256: "test", data: Buffer.from("%PDF-"), uploadedById: actorId, status: "APPROVED", expiresOn: new Date(`${date}T00:00Z`) } } } }); requirementId = requirement.id;
  await db.complianceRequirement.create({ data: { organizationId: other, title: "Other gate", documents: { create: { revision: 1, fileName: "test.pdf", mimeType: "application/pdf", size: 5, sha256: "test", data: Buffer.from("%PDF-"), uploadedById: actorId, status: "APPROVED" } } } });
  await initializeAssistant(org); await initializeAssistant(other);
  serviceId = (await db.service.create({ data: { organizationId: org, name: "Booking Tour", description: "", durationMinutes: 120, pricingType: "PER_PERSON", basePriceCents: 4990, capacity: 6, meetingPoint: "Station", languages: ["en"], active: true } })).id;
  vehicleId = (await db.vehicle.create({ data: { organizationId: org, name: "Booking Jeep", type: "JEEP", registration: "BK001", capacity: 6, features: [], active: true } })).id;
  driverId = (await db.driver.create({ data: { organizationId: org, name: "Booking Driver", email: `driver-${suffix}@example.test`, phone: "+351912345678", languages: ["en"], status: "ACTIVE" } })).id;
  await db.serviceVehicle.create({ data: { organizationId: org, serviceId, vehicleId } });
  for (const departureMinutes of [600, 720, 750, 840, 1020]) await db.serviceSchedule.create({ data: { organizationId: org, serviceId, weekday: Temporal.PlainDate.from(date).dayOfWeek, departureMinutes, validFrom: new Date(`${date}T00:00Z`), validUntil: new Date(`${date}T00:00Z`), bufferBeforeMinutes: 15, bufferAfterMinutes: 15 } });
  await db.driverAvailability.create({ data: { organizationId: org, driverId, startsAt: new Date(`${date}T00:00Z`), endsAt: new Date(`${date}T23:59Z`) } });
});
afterAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) return;
  const db = getDb(), where = { organizationId: { in: orgs } };
  await db.assistantToolCall.deleteMany({ where }); await db.assistantHandoff.deleteMany({ where }); await db.assistantConversation.deleteMany({ where });
  await db.assistantVersion.deleteMany({ where }); await db.assistantProfile.deleteMany({ where });
  await db.bookingEvent.deleteMany({ where }); await db.bookingOccupancy.deleteMany({ where }); await db.booking.deleteMany({ where }); await db.customer.deleteMany({ where });
  await db.resourceBlock.deleteMany({ where }); await db.driverAvailability.deleteMany({ where }); await db.serviceVehicle.deleteMany({ where }); await db.serviceSchedule.deleteMany({ where });
  await db.service.deleteMany({ where }); await db.vehicle.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.complianceReview.deleteMany({ where }); await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: [actorId, outsider] } } }); await db.$disconnect();
});

beforeEach(async () => {
  session.userId = actorId;
  const db = getDb(), where = { organizationId: { in: orgs } };
  await db.assistantToolCall.deleteMany({ where }); await db.assistantHandoff.deleteMany({ where }); await db.assistantConversation.deleteMany({ where });
  await db.bookingEvent.deleteMany({ where }); await db.bookingOccupancy.deleteMany({ where }); await db.booking.deleteMany({ where }); await db.customer.deleteMany({ where });
  await db.operatorProfile.updateMany({ where, data: { status: "APPROVED", approvedAt: new Date(), approvedById: actorId } });
  await db.organizationMember.updateMany({ where: { ...where, userId: actorId }, data: { active: true, role: "OPERATOR_OWNER" } });
  await db.user.update({ where: { id: actorId }, data: { active: true } });
  await db.complianceDocument.updateMany({ where, data: { status: "APPROVED" } });
  await db.assistantVersion.updateMany({ where, data: { playbookVersion: PLAYBOOK_VERSION } });
  await db.service.update({ where: { id: serviceId }, data: { version: 0 } });
});
describe("Alana tenant-bound tools", () => {
  it("lists live active catalog with pagination, scopes details and hides resource/contact internals", async () => {
    const id = await startAssistantSession(org), db = getDb();
    const result = await run(id, "get_services", {}); expect(result.success).toBe(true); expect(result.services?.items.map(item => item.id)).toContain(serviceId);
    const details = await run(id, "get_service_details", { serviceId }); expect(details.service).toMatchObject({ basePriceCents: 4990, version: 0 });
    const foreign = await db.service.create({ data: { organizationId: other, name: "Foreign service", description: "Secret", durationMinutes: 30, pricingType: "PER_GROUP", basePriceCents: 500, capacity: 2, meetingPoint: "Private", languages: ["en"], active: true } });
    expect(await run(id, "get_service_details", { serviceId: foreign.id })).toMatchObject({ success: false, code: "SERVICE_NOT_FOUND" });
    const inactive = await db.service.create({ data: { ...foreign, id: undefined, organizationId: org, name: "Inactive", active: false } });
    expect(await run(id, "get_service_details", { serviceId: inactive.id })).toMatchObject({ success: false, code: "SERVICE_NOT_FOUND" });
    for (let index = 0; index < 26; index++) await db.service.create({ data: { organizationId: org, name: `Page ${index}`, description: "", durationMinutes: 30, pricingType: "PER_GROUP", basePriceCents: 500, capacity: 2, meetingPoint: "Station", languages: ["en"], active: true } });
    const next = await run(id, "get_services", { page: 2 }); expect(next.services?.items).toHaveLength(2); expect(next.services?.total).toBe(27);
    await db.service.deleteMany({ where: { organizationId: { in: orgs }, id: { not: serviceId } } });
    const availability = await run(id, "check_availability", { serviceId, date, time: "10:00", passengers: 4, language: "en" });
    expect(availability.availability).toMatchObject({ available: true, reservationConfirmed: false });
    expect(JSON.stringify(availability)).not.toContain(driverId); expect(JSON.stringify(availability)).not.toContain(vehicleId);
    expect(await db.booking.count({ where: { organizationId: org } })).toBe(0);
  });
  it("requires owner, active membership and session creator even within the same operator", async () => {
    const id = await startAssistantSession(org);
    for (const userId of [null, outsider]) { session.userId = userId; await expect(run(id, "get_services", {})).rejects.toBeInstanceOf(AccessDenied); }
    session.userId = actorId;
    for (const role of ["DRIVER", "OPERATOR_VIEWER", "OPERATOR_DISPATCHER"] as const) {
      await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: actorId }, data: { role } });
      await expect(run(id, "get_services", {})).rejects.toBeInstanceOf(AccessDenied); await expect(startAssistantSession(org)).rejects.toBeInstanceOf(AccessDenied);
    }
    await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: actorId }, data: { role: "OPERATOR_OWNER" } });
    await getDb().assistantConversation.update({ where: { id }, data: { actorId: outsider } });
    await expect(readAssistantSession(org, id)).rejects.toBeInstanceOf(AccessDenied); await expect(run(id, "get_services", {})).rejects.toBeInstanceOf(AccessDenied);
    await getDb().assistantConversation.update({ where: { id }, data: { actorId } });
    await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: actorId }, data: { active: false } });
    await expect(run(id, "get_services", {})).rejects.toBeInstanceOf(AccessDenied);
    await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: actorId }, data: { active: true } });
    await getDb().user.update({ where: { id: actorId }, data: { active: false } }); await expect(run(id, "get_services", {})).rejects.toBeInstanceOf(AccessDenied);
  });
  it("creates one real sandbox booking on concurrent replay, computes price and reads only its session receipt", async () => {
    const id = await startAssistantSession(org), key = randomUUID();
    const results = await Promise.all([run(id, "create_booking", request(), key), run(id, "create_booking", request(), key)]);
    expect(results.every(result => result.success)).toBe(true); expect(results[0]?.booking?.id).toBe(results[1]?.booking?.id);
    expect(results[0]?.booking).toMatchObject({ totalPriceCents: 19960, status: "CONFIRMED", mode: "SANDBOX" });
    expect(await getDb().booking.count({ where: { organizationId: org } })).toBe(1);
    expect(await getDb().assistantToolCall.count({ where: { conversationId: id } })).toBe(1);
    expect(await run(id, "create_booking", { ...request(), passengers: 2 }, key)).toMatchObject({ success: false, code: "IDEMPOTENCY_CONFLICT" });
    const bookingId = results[0]!.booking!.id;
    expect((await run(id, "get_booking", { bookingId })).booking?.id).toBe(bookingId);
    expect(JSON.stringify(await run(id, "get_booking", { bookingId }))).not.toContain("private@example.test");
    const another = await startAssistantSession(org);
    expect(await run(another, "get_booking", { bookingId })).toMatchObject({ success: false, code: "BOOKING_NOT_FOUND" });
    await expect(executeAssistantTool(other, id, randomUUID(), { tool: "get_booking", input: { bookingId } })).rejects.toBeInstanceOf(AccessDenied);
    await cancelBooking(org, bookingId, 0);
    expect((await run(id, "get_booking", { bookingId })).booking?.status).toBe("CANCELLED");
    expect((await run(id, "create_booking", request(), key)).booking?.status).toBe("CANCELLED");
  });
  it("does not grant access to pre-existing same-tenant bookings and only one distinct request wins the last resource", async () => {
    const id = await startAssistantSession(org);
    const { serviceVersion, ...payload } = request(); void serviceVersion;
    const existing = await createBooking(org, { ...payload, idempotencyKey: randomUUID() });
    expect(await run(id, "get_booking", { bookingId: existing.id })).toMatchObject({ success: false, code: "BOOKING_NOT_FOUND" });
    await cancelBooking(org, existing.id, 0);
    const results = await Promise.all([run(id, "create_booking", request()), run(id, "create_booking", request())]);
    expect(results.filter(result => result.success)).toHaveLength(1); expect(results.filter(result => !result.success)[0]?.booking).toBeUndefined();
  });
  it("rejects price/tenant overrides, stale service/configuration, unsupported assistant language and expired sessions", async () => {
    const id = await startAssistantSession(org);
    for (const addition of [{ organizationId: other }, { totalPriceCents: 1 }, { source: "PHONE" }]) expect(await run(id, "create_booking", { ...request(), ...addition })).toMatchObject({ success: false, code: "INVALID_INPUT" });
    expect(await run(id, "check_availability", { serviceId, date, time: "10:00", passengers: 2, language: "pt" })).toMatchObject({ success: false, code: "LANGUAGE_DISABLED" });
    await getDb().service.update({ where: { id: serviceId }, data: { version: 1 } });
    expect(await run(id, "create_booking", request())).toMatchObject({ success: false, code: "SERVICE_CHANGED" });
    const config = await readAssistant(org); await updateAssistant(org, config!.version, config!.selected.configuration);
    expect(await run(id, "get_services", {})).toMatchObject({ success: false, code: "CONFIGURATION_CHANGED" });
    await getDb().assistantConversation.update({ where: { id }, data: { createdAt: new Date(Date.now() - 48 * 3600000), expiresAt: new Date(Date.now() - 25 * 3600000) } });
    expect(await run(id, "get_services", {})).toMatchObject({ success: false, code: "SESSION_EXPIRED" });
    expect(await getDb().booking.count({ where: { organizationId: org } })).toBe(0);
  });
  it("requires updated core explicitly, preserves old snapshots and enforces documentary/production gates", async () => {
    const config = await readAssistant(org);
    await getDb().assistantVersion.update({ where: { organizationId_version: { organizationId: org, version: config!.version } }, data: { playbookVersion: "alana-core-1" } });
    await expect(startAssistantSession(org)).rejects.toThrow("configuração atual");
    await updateAssistant(org, config!.version, config!.selected.configuration);
    expect((await readAssistant(org, config!.version))?.selected.playbookVersion).toBe("alana-core-1");
    const id = await startAssistantSession(org);
    for (const status of ["ONBOARDING", "RESTRICTED", "SUSPENDED", "LIVE"] as const) {
      await getDb().operatorProfile.update({ where: { organizationId: org }, data: { status } });
      expect(await run(id, "create_booking", request())).toMatchObject({ success: false, code: "OPERATION_REJECTED" });
      await expect(startAssistantSession(org)).rejects.toThrow();
    }
    await getDb().operatorProfile.update({ where: { organizationId: org }, data: { status: "APPROVED" } });
    await getDb().complianceDocument.updateMany({ where: { requirementId }, data: { status: "EXPIRED" } });
    expect(await run(id, "get_services", {})).toMatchObject({ success: false, code: "OPERATION_REJECTED" });
    expect(await getDb().assistantToolCall.count({ where: { conversationId: id } })).toBe(0);
  });
  it("registers a single human queue request with replay and no notification, including under suspension", async () => {
    const id = await startAssistantSession(org), key = randomUUID();
    await getDb().operatorProfile.update({ where: { organizationId: org }, data: { status: "SUSPENDED" } });
    const results = await Promise.all([run(id, "handoff_to_human", { reason: "Private customer exception" }, key), run(id, "handoff_to_human", { reason: "Private customer exception" }, key)]);
    expect(results[0]?.handoff).toMatchObject({ status: "OPEN", notificationSent: false }); expect(results[0]?.handoff?.id).toBe(results[1]?.handoff?.id);
    await run(id, "handoff_to_human", { reason: "New reason must not replace original" });
    const queue = await readAssistantHandoffs(org); expect(queue).toHaveLength(1); expect(queue[0]?.reason).toBe("Private customer exception");
    expect(await readAssistantHandoffs(other)).toEqual([]);
    const audit = await getDb().auditLog.findMany({ where: { organizationId: org, action: { startsWith: "assistant." } } }); expect(JSON.stringify(audit)).not.toContain("Private customer exception");
    expect(await getDb().booking.count({ where: { organizationId: org } })).toBe(0);
  });
  it("bounds persistent sessions/calls while preserving replay after the limit", async () => {
    const db = getDb(), id = await startAssistantSession(org), key = randomUUID();
    await run(id, "handoff_to_human", { reason: "Help requested" }, key);
    await db.assistantToolCall.createMany({ data: Array.from({ length: 99 }, () => ({ conversationId: id, organizationId: org, callId: randomUUID(), tool: "handoff_to_human", requestHash: "0".repeat(64) })) });
    expect(await run(id, "handoff_to_human", { reason: "Help requested" }, key)).toMatchObject({ success: true, replayed: true });
    expect(await run(id, "handoff_to_human", { reason: "Another request" })).toMatchObject({ success: false, code: "LIMIT_REACHED" });
    const profile = await readAssistant(org), now = new Date();
    await db.assistantConversation.createMany({ data: Array.from({ length: 499 }, () => ({ organizationId: org, actorId, assistantVersion: profile!.version, createdAt: now, expiresAt: new Date(now.valueOf() + 3600000) })) });
    await expect(startAssistantSession(org)).rejects.toThrow("500 sessões");
  });
  it("rolls back booking/customer/occupancy/event/grant and handoff on tool audit failure", async () => {
    const id = await startAssistantSession(org), db = getDb(), name = `tools_test_${suffix.replaceAll("-", "")}`;
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId" = '${org}' AND NEW."action" IN ('assistant.booking_created', 'assistant.handoff_registered') THEN RAISE EXCEPTION 'fixture tool failure'; END IF; RETURN NEW; END $$`);
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      expect(await run(id, "create_booking", request())).toMatchObject({ success: false, code: "INTERNAL_ERROR" });
      expect(await run(id, "handoff_to_human", { reason: "Private exception" })).toMatchObject({ success: false, code: "INTERNAL_ERROR" });
      expect(await db.assistantHandoff.count({ where: { organizationId: org } })).toBe(0);
      for (const count of await Promise.all([db.booking.count({ where: { organizationId: org } }), db.customer.count({ where: { organizationId: org } }), db.bookingOccupancy.count({ where: { organizationId: org } }), db.bookingEvent.count({ where: { organizationId: org } }), db.assistantToolCall.count({ where: { conversationId: id } })])) expect(count).toBe(0);
    } finally { await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "AuditLog"`); await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`); }
  });
});
