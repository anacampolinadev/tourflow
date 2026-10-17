import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { getDb } from "../src/lib/db";
import { enableDriverAccount, readDriverPortal, actOnDriverBooking } from "../src/modules/drivers";
import { readOperatorDashboard, readOperatorReport } from "../src/modules/operator";
import { AccessDenied } from "../src/modules/auth";
import { createBooking, cancelBooking } from "../src/modules/bookings";
import { dispatchBooking } from "../src/modules/dispatch";
const suffix = randomUUID(), owner = `driver-portal-owner-${suffix}`, outsider = `driver-portal-out-${suffix}`;
const driverUser = `driver-account-${suffix}`, bUser = `driver-b-account-${suffix}`;
const orgs: string[] = [];
let org = "", other = "", serviceId = "", large = "", fit = "", a = "", b = "", bookingId = "";
const date = Temporal.Now.plainDateISO("Europe/Lisbon").add({ days: 15 }).toString();
const bookingInput = (time = "10:00") => ({ idempotencyKey: randomUUID(), serviceId, date, time, passengers: 4, language: "en", customerName: "Private Dispatch", customerEmail: "private-dispatch@example.test", customerPhone: "+351912345678" });
const manual = (driverId: string, vehicleId: string, expectedVersion = 0) => ({ mode: "MANUAL", expectedVersion, idempotencyKey: randomUUID(), driverId, vehicleId, reason: "Manual operational fixture" });
const current = () => getDb().booking.findUniqueOrThrow({ where: { id: bookingId } });
const hold = () => getDb().bookingOccupancy.findUniqueOrThrow({ where: { bookingId } });
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required.");
  const db = getDb();
  await db.user.createMany({ data: [{ id: owner, email: `driver-portal-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }, { id: outsider, email: `driver-portal-out-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }] });
  await db.user.createMany({ data: [{ id: driverUser, email: `a-${suffix}@example.test` }, { id: bUser, email: `b-${suffix}@example.test` }] });
  for (let index = 0; index < 2; index++) {
    const row = await db.organization.create({ data: { name: "Dispatch fixture", slug: `driver-portal-${suffix}-${index}`, members: { create: { userId: owner, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: "test@example.test", contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "APPROVED", approvedAt: new Date(), approvedById: owner } } } }); orgs.push(row.id);
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
beforeEach(async () => {
  session.userId = owner; bookingId = (await createBooking(org, bookingInput())).id;
  await dispatchBooking(org, bookingId, manual(a, large));
  const driver = await getDb().driver.findUniqueOrThrow({ where: { id: a } });
  if (!driver.userId) await enableDriverAccount(org, a, driver.version);
  session.userId = driverUser;
});
afterEach(async () => {
  const db = getDb(); session.userId = owner;
  await db.organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { role: "OPERATOR_OWNER", active: true } });
  await db.user.update({ where: { id: owner }, data: { active: true } });
  await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: owner } });
  await db.complianceDocument.updateMany({ where: { organizationId: org }, data: { status: "APPROVED", expiresOn: null } });
  await db.driverAction.deleteMany({ where: { organizationId: org } });
  await db.organizationMember.updateMany({ where: { organizationId: org, role: "DRIVER" }, data: { active: true } });
  await db.driver.updateMany({ where: { organizationId: org }, data: { status: "ACTIVE" } });
  await db.booking.updateMany({ where: { organizationId: org, status: { in: ["IN_PROGRESS", "COMPLETED"] } }, data: { status: "ASSIGNED" } });
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
  await db.user.deleteMany({ where: { id: { in: [owner, outsider, driverUser, bUser] } } }); await db.$disconnect();
});

const command = (type: "ACCEPT" | "DECLINE" | "ARRIVE" | "START" | "COMPLETE", expectedVersion = 1) => ({ type, expectedVersion, idempotencyKey: randomUUID() });
describe("private driver accounts and execution", () => {
  it("shows only dispatched own trips without prices, email or private notes", async () => {
    const portal = await readDriverPortal(org);
    expect(portal.bookings.map(row => row.id)).toEqual([bookingId]);
    expect(portal.bookings[0]).not.toHaveProperty("totalPriceCents");
    expect(portal.bookings[0]).not.toHaveProperty("notes");
    expect(portal.bookings[0]?.customer).not.toHaveProperty("email");
    session.userId = owner; const provisional = await createBooking(org, bookingInput("14:00"));
    session.userId = driverUser;
    expect((await readDriverPortal(org)).bookings.map(row => row.id)).not.toContain(provisional.id);
    await expect(actOnDriverBooking(org, provisional.id, command("ACCEPT", 0))).rejects.toThrow();
    await expect(readDriverPortal(other)).rejects.toBeInstanceOf(AccessDenied);
    await expect(actOnDriverBooking(other, bookingId, command("ACCEPT"))).rejects.toBeInstanceOf(AccessDenied);
  });
  it("rechecks user, membership, driver state and role on every request", async () => {
    session.userId = owner; await expect(readDriverPortal(org)).rejects.toBeInstanceOf(AccessDenied);
    session.userId = outsider; await expect(readDriverPortal(org)).rejects.toBeInstanceOf(AccessDenied);
    session.userId = driverUser;
    const db = getDb();
    await db.organizationMember.updateMany({ where: { organizationId: org, userId: driverUser }, data: { active: false } });
    await expect(readDriverPortal(org)).rejects.toBeInstanceOf(AccessDenied);
    await expect(actOnDriverBooking(org, bookingId, command("ACCEPT"))).rejects.toBeInstanceOf(AccessDenied);
    await db.organizationMember.updateMany({ where: { organizationId: org, userId: driverUser }, data: { active: true } });
    await db.driver.update({ where: { id: a }, data: { status: "SUSPENDED" } });
    await expect(readDriverPortal(org)).rejects.toBeInstanceOf(AccessDenied);
    await db.driver.update({ where: { id: a }, data: { status: "ACTIVE" } });
    await db.user.update({ where: { id: driverUser }, data: { active: false } });
    try { await expect(readDriverPortal(org)).rejects.toBeInstanceOf(AccessDenied); }
    finally { await db.user.update({ where: { id: driverUser }, data: { active: true } }); }
  });
  it("requires an explicit owner action to grant access and preserves existing privileged memberships", async () => {
    const db = getDb(), driver = await db.driver.findUniqueOrThrow({ where: { id: b } });
    expect(driver.userId).toBeNull();
    await expect(enableDriverAccount(org, b, driver.version)).rejects.toBeInstanceOf(AccessDenied);
    session.userId = owner;
    await db.organizationMember.create({ data: { organizationId: org, userId: bUser, role: "OPERATOR_VIEWER" } });
    await expect(enableDriverAccount(org, b, driver.version)).rejects.toThrow("vínculo");
    expect((await db.driver.findUniqueOrThrow({ where: { id: b } })).userId).toBeNull();
    await db.organizationMember.deleteMany({ where: { organizationId: org, userId: bUser } });
    await enableDriverAccount(org, b, driver.version);
    expect(await db.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: org, userId: bUser } } })).toMatchObject({ role: "DRIVER", active: true });
    await expect(enableDriverAccount(org, b, driver.version)).rejects.toThrow("mudou");
    // Editing the contact must never transfer identity.
    await db.driver.update({ where: { id: b }, data: { email: 'changed-' + suffix + '@example.test' } });
    expect((await db.driver.findUniqueOrThrow({ where: { id: b } })).userId).toBe(bUser);
    await db.driver.update({ where: { id: b }, data: { email: 'b-' + suffix + '@example.test', userId: null } });
    await db.organizationMember.deleteMany({ where: { organizationId: org, userId: bUser } });
  });
  it("serializes duplicate acceptance and rejects changed payload with the same key", async () => {
    const input = command("ACCEPT"), before = await hold();
    const results = await Promise.all([actOnDriverBooking(org, bookingId, input), actOnDriverBooking(org, bookingId, input)]);
    expect(results[0].id).toBe(results[1].id); expect((await current()).version).toBe(2);
    expect(await getDb().driverAction.count({ where: { bookingId } })).toBe(1);
    await expect(actOnDriverBooking(org, bookingId, { ...input, type: "DECLINE" })).rejects.toThrow("chave");
    expect(await hold()).toEqual(before);
    session.userId = owner; await expect(dispatchBooking(org, bookingId, manual(b, fit, 2))).rejects.toThrow("distribuição");
  });
  it("allows only one of simultaneous acceptance and refusal", async () => {
    const results = await Promise.allSettled([actOnDriverBooking(org, bookingId, command("ACCEPT")), actOnDriverBooking(org, bookingId, command("DECLINE"))]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect((await current()).version).toBe(2); expect(await getDb().driverAction.count({ where: { bookingId } })).toBe(1);
  });
  it("rejects stale actions after cancellation and cannot expose another driver's assignment", async () => {
    session.userId = owner; await dispatchBooking(org, bookingId, manual(b, fit, 1));
    session.userId = driverUser; expect((await readDriverPortal(org)).bookings).toHaveLength(0);
    await expect(actOnDriverBooking(org, bookingId, command("ACCEPT"))).rejects.toBeInstanceOf(AccessDenied);
    session.userId = owner; await cancelBooking(org, bookingId, 2);
    session.userId = driverUser; await expect(actOnDriverBooking(org, bookingId, command("ACCEPT", 3))).rejects.toBeInstanceOf(AccessDenied);
  });
  it("preserves the hold on refusal, alerts the operator and excludes the refusing driver from redispatch", async () => {
    const before = await hold(); await actOnDriverBooking(org, bookingId, command("DECLINE"));
    expect(await hold()).toEqual(before); expect((await readDriverPortal(org)).bookings).toHaveLength(0);
    session.userId = owner;
    const dashboard = await readOperatorDashboard(org, { date }); expect(dashboard.problems.map(row => row.id)).toContain(bookingId);
    expect(dashboard.stats.confirmed).toBe(1);
    await expect(dispatchBooking(org, bookingId, manual(a, large, 2))).rejects.toThrow("elegíveis");
    await dispatchBooking(org, bookingId, { mode: "AUTO", expectedVersion: 2, idempotencyKey: randomUUID() }); expect((await hold()).driverId).toBe(b);
    expect((await readOperatorDashboard(org, { date })).problemCount).toBe(0);
    const driver = await getDb().driver.findUniqueOrThrow({ where: { id: b } });
    await enableDriverAccount(org, b, driver.version);
    session.userId = bUser; await actOnDriverBooking(org, bookingId, command("DECLINE", 3));
    session.userId = owner;
    const beforeRetry = await hold();
    const result = await dispatchBooking(org, bookingId, { mode: "AUTO", expectedVersion: 4, idempotencyKey: randomUUID() });
    expect(result.outcome).toBe("NO_CANDIDATE"); expect(result.reason).toContain("recusaram");
    expect(await hold()).toEqual(beforeRetry); expect((await current()).status).toBe("DRIVER_DECLINED");
  });
  it("runs every stage, records history and keeps buffers on early completion", async () => {
    const db = getDb(); await actOnDriverBooking(org, bookingId, command("ACCEPT"));
    await expect(actOnDriverBooking(org, bookingId, command("ARRIVE", 2))).rejects.toThrow("duas horas");
    const start = new Date(Date.now() - 60000), end = new Date(Date.now() + 3600000);
    await db.booking.update({ where: { id: bookingId }, data: { startsAt: start, endsAt: end } });
    await db.bookingOccupancy.update({ where: { bookingId }, data: { startsAt: new Date(start.valueOf() - 900000), endsAt: new Date(end.valueOf() + 900000) } });
    const before = await hold();
    await actOnDriverBooking(org, bookingId, command("ARRIVE", 2));
    await actOnDriverBooking(org, bookingId, command("START", 3));
    session.userId = owner; await expect(cancelBooking(org, bookingId, 4)).rejects.toThrow("estado");
    await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "SUSPENDED" } });
    session.userId = driverUser; await actOnDriverBooking(org, bookingId, command("COMPLETE", 4));
    expect(await hold()).toEqual(before); expect((await current()).status).toBe("COMPLETED");
    expect((await readDriverPortal(org)).bookings).toHaveLength(0);
    expect((await readDriverPortal(org, 1, true)).bookings[0]?.id).toBe(bookingId);
    expect(await db.driverAction.count({ where: { bookingId } })).toBe(4);
    session.userId = owner;
    const today = Temporal.Now.plainDateISO("Europe/Lisbon").toString();
    expect((await readOperatorReport(org, { from: today, until: today })).totals.assigned).toBe(1);
  });
  it("blocks acceptance on invalid compliance but permits refusal under suspension", async () => {
    await getDb().operatorProfile.update({ where: { organizationId: org }, data: { status: "SUSPENDED" } });
    await expect(actOnDriverBooking(org, bookingId, command("ACCEPT"))).rejects.toThrow();
    expect((await current()).version).toBe(1); await actOnDriverBooking(org, bookingId, command("DECLINE"));
    expect((await current()).status).toBe("DRIVER_DECLINED");
  });
  it("prevents starting a second trip while an earlier trip is still in progress, even after its scheduled end", async () => {
    const db = getDb(); session.userId = owner;
    const later = await createBooking(org, bookingInput("14:00"));
    await dispatchBooking(org, later.id, manual(a, large));
    const now = Date.now();
    await db.booking.update({ where: { id: bookingId }, data: { status: "IN_PROGRESS", startsAt: new Date(now - 7200000), endsAt: new Date(now - 3600000) } });
    await db.bookingOccupancy.update({ where: { bookingId }, data: { startsAt: new Date(now - 8100000), endsAt: new Date(now - 2700000) } });
    await db.booking.update({ where: { id: later.id }, data: { status: "ARRIVED", startsAt: new Date(now - 60000), endsAt: new Date(now + 3600000) } });
    await db.bookingOccupancy.update({ where: { bookingId: later.id }, data: { startsAt: new Date(now - 900000), endsAt: new Date(now + 4500000) } });
    session.userId = driverUser;
    await expect(actOnDriverBooking(org, later.id, command("START"))).rejects.toThrow("serviço em curso");
    expect((await db.booking.findUniqueOrThrow({ where: { id: later.id } })).status).toBe("ARRIVED");
  });
  it("rolls back status, events and audit if the action record fails", async () => {
    const db = getDb(), name = 'driver_test_' + suffix.replaceAll('-', '');
    const before = await current(), events = await db.bookingEvent.count({ where: { bookingId } }), audits = await db.auditLog.count({ where: { organizationId: org } });
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId" = '${org}' THEN RAISE EXCEPTION 'fixture action failure'; END IF; RETURN NEW; END $$`);
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "DriverAction" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      await expect(actOnDriverBooking(org, bookingId, command("ACCEPT"))).rejects.toThrow();
      expect(await current()).toEqual(before); expect(await db.bookingEvent.count({ where: { bookingId } })).toBe(events);
      expect(await db.auditLog.count({ where: { organizationId: org } })).toBe(audits);
    } finally { await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "DriverAction"`); await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`); }
  });
});
