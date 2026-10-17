import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { getDb } from "../src/lib/db";
import { AccessDenied } from "../src/modules/auth";
import { createBooking, cancelBooking } from "../src/modules/bookings";
import { dispatchBooking, readDispatch } from "../src/modules/dispatch";
import { checkAvailability } from "../src/modules/availability";
const suffix = randomUUID(), owner = `dispatch-owner-${suffix}`, outsider = `dispatch-out-${suffix}`;
const orgs: string[] = [];
let org = "", other = "", serviceId = "", large = "", fit = "", a = "", b = "", bookingId = "";
const date = Temporal.Now.plainDateISO("Europe/Lisbon").add({ days: 15 }).toString();
const bookingInput = (time = "10:00") => ({ idempotencyKey: randomUUID(), serviceId, date, time, passengers: 4, language: "en", customerName: "Private Dispatch", customerEmail: "private-dispatch@example.test", customerPhone: "+351912345678" });
const auto = (expectedVersion = 0) => ({ mode: "AUTO", expectedVersion, idempotencyKey: randomUUID() });
const manual = (driverId: string, vehicleId: string, expectedVersion = 0) => ({ mode: "MANUAL", expectedVersion, idempotencyKey: randomUUID(), driverId, vehicleId, reason: "Manual operational fixture" });
const current = () => getDb().booking.findUniqueOrThrow({ where: { id: bookingId } });
const hold = () => getDb().bookingOccupancy.findUniqueOrThrow({ where: { bookingId } });
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required.");
  const db = getDb();
  await db.user.createMany({ data: [{ id: owner, email: `dispatch-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }, { id: outsider, email: `dispatch-out-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }] });
  for (let index = 0; index < 2; index++) {
    const row = await db.organization.create({ data: { name: "Dispatch fixture", slug: `dispatch-${suffix}-${index}`, members: { create: { userId: owner, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: "test@example.test", contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "APPROVED", approvedAt: new Date(), approvedById: owner } } } }); orgs.push(row.id);
  }
  org = orgs[0]!; other = orgs[1]!;
  await db.complianceRequirement.create({ data: { organizationId: org, title: "Approved fixture", requiresExpiry: false, documents: { create: { revision: 1, fileName: "test.pdf", mimeType: "application/pdf", size: 5, sha256: "test", data: Buffer.from("%PDF-"), uploadedById: owner, status: "APPROVED" } } } });
  serviceId = (await db.service.create({ data: { organizationId: org, name: "Dispatch Tour", description: "", durationMinutes: 120, pricingType: "PER_PERSON", basePriceCents: 4990, capacity: 8, meetingPoint: "Station", languages: ["en"], active: true } })).id;
  for (const [prefix, capacity] of [["a", 8], ["b", 4]] as const) {
    const vehicle = await db.vehicle.create({ data: { id: `${prefix}-vehicle-${suffix}`, organizationId: org, name: prefix, type: "VAN", registration: `DP${prefix}`, capacity, features: [], active: true } });
    await db.serviceVehicle.create({ data: { organizationId: org, serviceId, vehicleId: vehicle.id } });
    const driver = await db.driver.create({ data: { id: `${prefix}-driver-${suffix}`, organizationId: org, name: prefix, email: `${prefix}-${suffix}@example.test`, phone: "+351912345678", languages: ["en"], status: "ACTIVE" } });
    await db.driverAvailability.create({ data: { organizationId: org, driverId: driver.id, startsAt: new Date(`${date}T00:00Z`), endsAt: new Date(`${date}T23:59Z`) } });
    if (prefix === "a") { large = vehicle.id; a = driver.id; } else { fit = vehicle.id; b = driver.id; }
  }
  for (const departureMinutes of [600, 840]) await db.serviceSchedule.create({ data: { organizationId: org, serviceId, weekday: Temporal.PlainDate.from(date).dayOfWeek, departureMinutes, validFrom: new Date(`${date}T00:00Z`), validUntil: new Date(`${date}T00:00Z`), bufferBeforeMinutes: 15, bufferAfterMinutes: 15 } });
});
beforeEach(async () => { session.userId = owner; bookingId = (await createBooking(org, bookingInput())).id; });
afterEach(async () => {
  const db = getDb(); session.userId = owner;
  await db.organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { role: "OPERATOR_OWNER", active: true } });
  await db.user.update({ where: { id: owner }, data: { active: true } });
  await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: owner } });
  await db.complianceDocument.updateMany({ where: { organizationId: org }, data: { status: "APPROVED", expiresOn: null } });
  for (const row of await db.booking.findMany({ where: { organizationId: org, status: { not: "CANCELLED" } } })) await cancelBooking(org, row.id, row.version);
  await db.resourceBlock.deleteMany({ where: { organizationId: org } });
  await db.driver.updateMany({ where: { organizationId: org }, data: { status: "ACTIVE", languages: ["en"] } });
  await db.vehicle.updateMany({ where: { organizationId: org }, data: { active: true } });
});
afterAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) return;
  const db = getDb(), where = { organizationId: { in: orgs } };
  await db.dispatchDecision.deleteMany({ where }); await db.bookingEvent.deleteMany({ where }); await db.bookingOccupancy.deleteMany({ where }); await db.booking.deleteMany({ where }); await db.customer.deleteMany({ where });
  await db.resourceBlock.deleteMany({ where }); await db.driverAvailability.deleteMany({ where }); await db.serviceVehicle.deleteMany({ where }); await db.serviceSchedule.deleteMany({ where });
  await db.service.deleteMany({ where }); await db.vehicle.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.complianceReview.deleteMany({ where }); await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: [owner, outsider] } } }); await db.$disconnect();
});
describe("transactional internal dispatch", () => {
  it("keeps preview read-only and rejects changed duration without changing the saved interval", async () => {
    const db = getDb(), before = await hold(), count = await db.dispatchDecision.count({ where: { bookingId } });
    await readDispatch(org, bookingId); await readDispatch(org, bookingId);
    expect(await db.dispatchDecision.count({ where: { bookingId } })).toBe(count); expect((await current()).version).toBe(0);
    await db.service.update({ where: { id: serviceId }, data: { durationMinutes: 150 } });
    try { await expect(dispatchBooking(org, bookingId, auto())).rejects.toThrow("intervalo"); expect(await hold()).toEqual(before); }
    finally { await db.service.update({ where: { id: serviceId }, data: { durationMinutes: 120 } }); }
  });
  it("requires active membership even for global admins; viewer and driver cannot write", async () => {
    for (const actor of [null, outsider]) { session.userId = actor; await expect(readDispatch(org, bookingId)).rejects.toBeInstanceOf(AccessDenied); await expect(dispatchBooking(org, bookingId, auto())).rejects.toBeInstanceOf(AccessDenied); }
    session.userId = owner;
    for (const role of ["OPERATOR_VIEWER", "DRIVER"] as const) {
      await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { role } });
      await expect(dispatchBooking(org, bookingId, auto())).rejects.toBeInstanceOf(AccessDenied);
    }
    await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { active: false } }); await expect(readDispatch(org, bookingId)).rejects.toBeInstanceOf(AccessDenied);
  });
  it("selects by workload and capacity while preserving price, interval and booking hold identity", async () => {
    const history = await createBooking(org, bookingInput("14:00")); await dispatchBooking(org, history.id, manual(a, large));
    const before = await hold(), booking = await current();
    const decision = await dispatchBooking(org, bookingId, auto());
    expect(decision).toMatchObject({ outcome: "ASSIGNED", driverId: b, vehicleId: fit, score: 8250, bookingVersion: 1 });
    expect(await hold()).toMatchObject({ id: before.id, driverId: b, vehicleId: fit, startsAt: before.startsAt, endsAt: before.endsAt });
    expect(await current()).toMatchObject({ status: "ASSIGNED", totalPriceCents: booking.totalPriceCents, startsAt: booking.startsAt, endsAt: booking.endsAt });
    expect((await readDispatch(org, bookingId)).decisions[0]?.id).toBe(decision.id);
  });
  it("replays identical concurrent requests once and rejects key reuse across payload or booking", async () => {
    const request = auto(), rows = await Promise.all([dispatchBooking(org, bookingId, request), dispatchBooking(org, bookingId, request)]);
    expect(rows[0]!.id).toBe(rows[1]!.id);
    expect(await getDb().bookingEvent.count({ where: { bookingId, type: "ASSIGNED" } })).toBe(1);
    await expect(dispatchBooking(org, bookingId, { ...request, expectedVersion: 1 })).rejects.toThrow("dados diferentes");
    const another = await createBooking(org, bookingInput("14:00")); await expect(dispatchBooking(org, another.id, request)).rejects.toThrow("dados diferentes");
  });
  it("allows just one concurrent distinct command for the displayed booking version", async () => {
    const results = await Promise.allSettled([dispatchBooking(org, bookingId, auto()), dispatchBooking(org, bookingId, auto())]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1); expect((await current()).version).toBe(1);
  });
  it("permits dispatcher manual reassignment with explanation and keeps an immutable decision history", async () => {
    await dispatchBooking(org, bookingId, auto());
    await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { role: "OPERATOR_DISPATCHER" } });
    const manualDecision = await dispatchBooking(org, bookingId, manual(b, large, 1));
    expect(manualDecision).toMatchObject({ mode: "MANUAL", driverId: b, vehicleId: large, reason: "Manual operational fixture" });
    expect(await hold()).toMatchObject({ driverId: b, vehicleId: large });
    expect((await readDispatch(org, bookingId)).decisions).toHaveLength(2);
  });
  it("does not allow manual choice to bypass tenant, inactive, language, capacity or conflicting resources", async () => {
    const before = await hold(), db = getDb();
    await expect(dispatchBooking(other, bookingId, auto())).rejects.toThrow("não encontrada");
    await expect(dispatchBooking(org, bookingId, manual("foreign", fit))).rejects.toThrow("elegíveis");
    await db.driver.update({ where: { id: b }, data: { status: "INACTIVE" } }); await expect(dispatchBooking(org, bookingId, manual(b, fit))).rejects.toThrow("elegíveis");
    await db.driver.update({ where: { id: b }, data: { status: "ACTIVE", languages: ["pt"] } }); await expect(dispatchBooking(org, bookingId, manual(b, fit))).rejects.toThrow("elegíveis");
    await db.driver.update({ where: { id: b }, data: { languages: ["en"] } }); await db.vehicle.update({ where: { id: fit }, data: { capacity: 2 } });
    await expect(dispatchBooking(org, bookingId, manual(b, fit))).rejects.toThrow("elegíveis"); await db.vehicle.update({ where: { id: fit }, data: { capacity: 4 } });
    await db.resourceBlock.create({ data: { organizationId: org, driverId: b, startsAt: before.startsAt, endsAt: before.endsAt, reason: "Test block" } });
    await expect(dispatchBooking(org, bookingId, manual(b, large))).rejects.toThrow("elegíveis"); expect(await hold()).toEqual(before); expect((await current()).version).toBe(0);
  });
  it("records no-candidate attempts without releasing the original occupancy, and retries with a new key", async () => {
    const before = await hold(), db = getDb();
    await db.driver.updateMany({ where: { organizationId: org }, data: { status: "SUSPENDED" } });
    const request = auto(), failed = await dispatchBooking(org, bookingId, request);
    expect(failed).toMatchObject({ outcome: "NO_CANDIDATE", driverId: null, vehicleId: null, score: null });
    expect(await hold()).toEqual(before); expect(await current()).toMatchObject({ status: "CONFIRMED", version: 1 });
    expect((await dispatchBooking(org, bookingId, request)).id).toBe(failed.id);
    await db.driver.updateMany({ where: { organizationId: org }, data: { status: "ACTIVE" } });
    expect((await dispatchBooking(org, bookingId, auto(1))).outcome).toBe("ASSIGNED");
  });
  it("rechecks approval, future document validity and suspension without changing the booking", async () => {
    const db = getDb(), before = await hold();
    for (const status of ["SUSPENDED", "RESTRICTED", "ONBOARDING", "LIVE"] as const) {
      await db.operatorProfile.update({ where: { organizationId: org }, data: { status } }); await expect(dispatchBooking(org, bookingId, auto())).rejects.toThrow("aprovação");
    }
    await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "APPROVED" } });
    await db.complianceDocument.updateMany({ where: { organizationId: org }, data: { expiresOn: new Date() } }); await expect(dispatchBooking(org, bookingId, auto())).rejects.toThrow("aprovação");
    expect(await hold()).toEqual(before); expect((await current()).version).toBe(0);
  });
  it("rechecks a second booking's occupancy and never assigns the same pair twice", async () => {
    const second = await createBooking(org, bookingInput());
    const results = await Promise.all([dispatchBooking(org, bookingId, auto()), dispatchBooking(org, second.id, auto())]);
    expect(results.every((row) => row.outcome === "ASSIGNED")).toBe(true);
    expect(results[0]!.driverId).not.toBe(results[1]!.driverId); expect(results[0]!.vehicleId).not.toBe(results[1]!.vehicleId);
    expect((await checkAvailability(org, { serviceId, date, time: "10:00", passengers: 4, language: "en" })).available).toBe(false);
  });
  it("rolls back reassignment, event, version and audit if decision persistence fails", async () => {
    const db = getDb(), before = await hold(), name = `dispatch_test_${suffix.replaceAll("-", "")}`;
    const eventCount = await db.bookingEvent.count({ where: { bookingId } }), auditCount = await db.auditLog.count({ where: { organizationId: org } });
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId" = '${org}' THEN RAISE EXCEPTION 'fixture decision failure'; END IF; RETURN NEW; END $$`);
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "DispatchDecision" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      await expect(dispatchBooking(org, bookingId, manual(b, fit))).rejects.toThrow();
      expect(await hold()).toEqual(before); expect((await current()).version).toBe(0);
      expect(await db.bookingEvent.count({ where: { bookingId } })).toBe(eventCount); expect(await db.auditLog.count({ where: { organizationId: org } })).toBe(auditCount);
    } finally { await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "DispatchDecision"`); await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`); }
  });
  it("serializes cancellation against assignment and preserves decision history on cancellation", async () => {
    const request = auto();
    const results = await Promise.allSettled([dispatchBooking(org, bookingId, request), cancelBooking(org, bookingId, 0)]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    const row = await current(); if (row.status !== "CANCELLED") await cancelBooking(org, bookingId, row.version);
    if (results[0]?.status === "fulfilled") {
      expect((await dispatchBooking(org, bookingId, request)).id).toBe(results[0].value.id);
      expect((await current()).status).toBe("CANCELLED");
    }
    await expect(dispatchBooking(org, bookingId, auto(2))).rejects.toThrow(); expect((await hold()).releasedAt).not.toBeNull();
  });
  it("keeps decisions scoped by tenant and audit free of manual notes and customer contacts", async () => {
    const decision = await dispatchBooking(org, bookingId, manual(b, large));
    expect(decision.factors).toMatchObject({ algorithm: "fair-v1", neutral: ["proximity", "rating", "acceptance"], resourceDocuments: "NOT_IMPLEMENTED_SANDBOX" });
    const logs = JSON.stringify(await getDb().auditLog.findMany({ where: { organizationId: org, action: "dispatch.decided" } }));
    for (const value of ["Private Dispatch", "private-dispatch@example.test", "Manual operational fixture", "+351912345678", "requestHash", "idempotencyKey"]) expect(logs).not.toContain(value);
    await expect(readDispatch(other, bookingId)).rejects.toThrow("não encontrada");
    await expect(getDb().dispatchDecision.update({ where: { id: decision.id }, data: { organizationId: other } })).rejects.toThrow();
  });
});
