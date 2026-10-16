import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { getDb } from "../src/lib/db";
import { AccessDenied } from "../src/modules/auth";
import { createBooking, cancelBooking, readBookings } from "../src/modules/bookings";
import { addResourceBlock, checkAvailability, deactivateCalendarEntry, setCalendarTimeZone } from "../src/modules/availability";
import { updateService } from "../src/modules/services";
const suffix = randomUUID(), actorId = `booking-owner-${suffix}`, outsider = `booking-out-${suffix}`;
const orgs: string[] = [];
let org = "", other = "", serviceId = "", vehicleId = "", driverId = "", requirementId = "";
const date = Temporal.Now.plainDateISO("Europe/Lisbon").add({ days: 15 }).toString();
const input = (time = "10:00", idempotencyKey = randomUUID()) => ({ idempotencyKey, serviceId, date, time, passengers: 4, language: "en", customerName: "Private Customer", customerEmail: "private@example.test", customerPhone: "+351912345678", notes: "Private notes" });
const query = () => ({ serviceId, date, time: "10:00", passengers: 4, language: "en" });
const totals = async () => {
  const where = { organizationId: org }, db = getDb();
  return Promise.all([db.customer.count({ where }), db.booking.count({ where }), db.bookingOccupancy.count({ where }), db.bookingEvent.count({ where }), db.auditLog.count({ where })]);
};
const releaseAll = async () => {
  for (const row of await getDb().booking.findMany({ where: { organizationId: org, status: "CONFIRMED" } })) await cancelBooking(org, row.id, row.version);
};
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required.");
  const db = getDb();
  await db.user.createMany({ data: [{ id: actorId, email: `booking-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }, { id: outsider, email: `booking-out-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }] });
  for (let n = 0; n < 2; n++) {
    const row = await db.organization.create({ data: { name: "Booking test", slug: `booking-${suffix}-${n}`, members: { create: { userId: actorId, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: "test@example.test", contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "APPROVED", approvedAt: new Date(), approvedById: actorId } } } }); orgs.push(row.id);
  }
  org = orgs[0]!; other = orgs[1]!; session.userId = actorId;
  const requirement = await db.complianceRequirement.create({ data: { organizationId: org, title: "Test requirement", requiresExpiry: true, documents: { create: { revision: 1, fileName: "test.pdf", mimeType: "application/pdf", size: 5, sha256: "test", data: Buffer.from("%PDF-"), uploadedById: actorId, status: "APPROVED", expiresOn: new Date(`${date}T00:00Z`) } } } }); requirementId = requirement.id;
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
  await db.bookingEvent.deleteMany({ where }); await db.bookingOccupancy.deleteMany({ where }); await db.booking.deleteMany({ where }); await db.customer.deleteMany({ where });
  await db.resourceBlock.deleteMany({ where }); await db.driverAvailability.deleteMany({ where }); await db.serviceVehicle.deleteMany({ where }); await db.serviceSchedule.deleteMany({ where });
  await db.service.deleteMany({ where }); await db.vehicle.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.complianceReview.deleteMany({ where }); await db.complianceDocument.deleteMany({ where }); await db.complianceRequirement.deleteMany({ where });
  await db.auditLog.deleteMany({ where }); await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: [actorId, outsider] } } }); await db.$disconnect();
});
describe("transactional sandbox bookings", () => {
  it("requires current tenant membership even for a global administrator", async () => {
    for (const userId of [null, outsider]) { session.userId = userId; await expect(createBooking(org, input())).rejects.toBeInstanceOf(AccessDenied); await expect(readBookings(org)).rejects.toBeInstanceOf(AccessDenied); }
    session.userId = actorId;
  });
  it("revalidates human approval, documents through service date and production gate without partial writes", async () => {
    const db = getDb(), before = await totals();
    for (const status of ["ONBOARDING", "UNDER_REVIEW", "SUSPENDED", "RESTRICTED", "LIVE"] as const) {
      await db.operatorProfile.update({ where: { organizationId: org }, data: { status } });
      await expect(createBooking(org, input())).rejects.toThrow("aprovação");
    }
    await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "APPROVED", approvedAt: null } });
    await expect(createBooking(org, input())).rejects.toThrow("aprovação");
    await db.operatorProfile.update({ where: { organizationId: org }, data: { approvedAt: new Date() } });
    await db.complianceDocument.updateMany({ where: { requirementId }, data: { expiresOn: new Date() } });
    await expect(createBooking(org, input())).rejects.toThrow("aprovação");
    await db.complianceDocument.updateMany({ where: { requirementId }, data: { expiresOn: new Date(`${date}T00:00Z`), status: "REJECTED" } });
    await expect(createBooking(org, input())).rejects.toThrow("aprovação");
    await db.complianceDocument.updateMany({ where: { requirementId }, data: { status: "APPROVED" } });
    expect(await totals()).toEqual(before);
  });
  it("atomically snapshots price, customer, conditions, occupancy and event", async () => {
    const before = await totals(), booking = await createBooking(org, input());
    expect(booking).toMatchObject({ mode: "SANDBOX", status: "CONFIRMED", totalPriceCents: 19960, unitPriceCents: 4990, serviceName: "Booking Tour", meetingPoint: "Station" });
    expect((await totals()).map((count, index) => count - before[index]!)).toEqual([1, 1, 1, 1, 1]);
    const hold = await getDb().bookingOccupancy.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(hold.startsAt.valueOf()).toBe(booking.startsAt.valueOf() - 15 * 60000); expect(hold.endsAt.valueOf()).toBe(booking.endsAt.valueOf() + 15 * 60000);
    expect((await checkAvailability(org, query())).reason).toBe("NO_VEHICLE");
    await releaseAll();
  });
  it("replays simultaneous identical requests once and rejects payload reuse", async () => {
    const request = input(), before = await totals();
    const results = await Promise.all([createBooking(org, request), createBooking(org, request)]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect((await totals()).map((count, index) => count - before[index]!)).toEqual([1, 1, 1, 1, 1]);
    await expect(createBooking(org, { ...request, passengers: 2 })).rejects.toThrow("dados diferentes");
    await cancelBooking(org, results[0]!.id, 0);
    expect((await createBooking(org, request)).status).toBe("CANCELLED");
  });
  it("admits only one distinct simultaneous request for the last resource pair", async () => {
    const before = await totals();
    const results = await Promise.allSettled([createBooking(org, input()), createBooking(org, input())]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await totals()).map((count, index) => count - before[index]!)).toEqual([1, 1, 1, 1, 1]);
    await releaseAll();
  });
  it("honors buffers across departures and half-open boundaries", async () => {
    await createBooking(org, input());
    await expect(createBooking(org, input("12:00"))).rejects.toThrow("Sem veículo");
    const adjacent = await createBooking(org, input("12:30")); expect(adjacent.status).toBe("CONFIRMED");
    await releaseAll();
  });
  it("rolls back customer, booking and hold if event persistence fails", async () => {
    const db = getDb(), before = await totals(), name = `booking_test_${suffix.replaceAll("-", "")}`;
    // UUID-derived SQL identifiers and fixture-only tenant; dedicated disposable test DB.
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId" = '${org}' THEN RAISE EXCEPTION 'fixture event failure'; END IF; RETURN NEW; END $$`);
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "BookingEvent" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      await expect(createBooking(org, input())).rejects.toThrow();
      expect(await totals()).toEqual(before);
      expect((await checkAvailability(org, query())).available).toBe(true);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "BookingEvent"`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
    }
  });
  it("rolls back invalid service, pickup, capacity and foreign references", async () => {
    const before = await totals();
    for (const extra of [{ serviceId: "missing" }, { pickup: "Hotel" }, { passengers: 9 }, { time: "09:00" }, { language: "pt" }]) await expect(createBooking(org, { ...input(), ...extra })).rejects.toThrow();
    await expect(createBooking(other, input())).rejects.toThrow();
    expect(await totals()).toEqual(before);
  });
  it("defends cross-tenant foreign keys and overlapping holds in PostgreSQL", async () => {
    const db = getDb(), first = await createBooking(org, input()), second = await createBooking(org, input("17:00"));
    const firstHold = await db.bookingOccupancy.findUniqueOrThrow({ where: { bookingId: first.id } });
    await expect(db.bookingOccupancy.update({ where: { bookingId: second.id }, data: { startsAt: firstHold.startsAt, endsAt: firstHold.endsAt } })).rejects.toThrow();
    const spareVehicle = await db.vehicle.create({ data: { organizationId: org, name: "Spare", type: "JEEP", registration: "BKSPARE", capacity: 6, features: [], active: true } });
    const spareDriver = await db.driver.create({ data: { organizationId: org, name: "Spare", email: `spare-${suffix}@example.test`, phone: "+351912345678", languages: ["en"], status: "ACTIVE" } });
    await db.bookingOccupancy.update({ where: { bookingId: second.id }, data: { vehicleId: spareVehicle.id } });
    // Different vehicles still cannot occupy the same driver.
    await expect(db.bookingOccupancy.update({ where: { bookingId: second.id }, data: { startsAt: firstHold.startsAt, endsAt: firstHold.endsAt } })).rejects.toThrow();
    await db.bookingOccupancy.update({ where: { bookingId: second.id }, data: { vehicleId, driverId: spareDriver.id } });
    // Different drivers still cannot occupy the same vehicle.
    await expect(db.bookingOccupancy.update({ where: { bookingId: second.id }, data: { startsAt: firstHold.startsAt, endsAt: firstHold.endsAt } })).rejects.toThrow();
    await expect(db.booking.update({ where: { id: first.id }, data: { organizationId: other } })).rejects.toThrow();
    await releaseAll();
  });
  it("serializes a booking racing a resource block on the same tenant root", async () => {
    const db = getDb(), profile = await db.operatorProfile.findUniqueOrThrow({ where: { organizationId: org } });
    const results = await Promise.allSettled([
      createBooking(org, input()),
      addResourceBlock(org, profile.calendarVersion, { resourceType: "vehicle", resourceId: vehicleId, startLocal: `${date}T09:00`, endLocal: `${date}T13:00`, reason: "Race fixture" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await releaseAll();
    for (const block of await db.resourceBlock.findMany({ where: { organizationId: org, active: true } })) {
      const current = await db.operatorProfile.findUniqueOrThrow({ where: { organizationId: org } });
      await deactivateCalendarEntry(org, current.calendarVersion, "block", block.id);
    }
    expect((await checkAvailability(org, query())).available).toBe(true);
  });
  it("prevents catalog/calendar edits silently invalidating future commitments", async () => {
    await createBooking(org, input());
    const db = getDb(), profile = await db.operatorProfile.findUniqueOrThrow({ where: { organizationId: org } });
    await expect(setCalendarTimeZone(org, profile.calendarVersion, "UTC")).rejects.toThrow();
    const service = await db.service.findUniqueOrThrow({ where: { id: serviceId } });
    await expect(updateService(org, serviceId, service.version, { name: service.name, description: service.description, durationMinutes: service.durationMinutes, pricingType: service.pricingType, basePriceCents: service.basePriceCents, currency: service.currency, capacity: service.capacity, meetingPoint: service.meetingPoint, pickupAvailable: service.pickupAvailable, pickupRules: service.pickupRules, languages: service.languages, active: false })).rejects.toThrow("reservas futuras");
    expect((await db.organization.findUniqueOrThrow({ where: { id: org } })).timeZone).toBe("Europe/Lisbon");
    await releaseAll();
  });
  it("cancels once even while suspended, releases capacity and preserves history", async () => {
    const db = getDb(), booking = await createBooking(org, input());
    await expect(cancelBooking(other, booking.id, 0)).rejects.toThrow();
    await expect(cancelBooking(org, booking.id, 4)).rejects.toThrow("mudou");
    await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "SUSPENDED" } });
    await Promise.all([cancelBooking(org, booking.id, 0), cancelBooking(org, booking.id, 0)]);
    expect(await db.bookingEvent.count({ where: { bookingId: booking.id, type: "CANCELLED" } })).toBe(1);
    expect((await db.bookingOccupancy.findUniqueOrThrow({ where: { bookingId: booking.id } })).releasedAt).not.toBeNull();
    await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "APPROVED" } });
    expect((await checkAvailability(org, query())).available).toBe(true);
  });
  it("enforces dispatcher, viewer, driver and revoked membership on every operation", async () => {
    const db = getDb(), where = { organizationId: org, userId: actorId };
    await db.organizationMember.updateMany({ where, data: { role: "OPERATOR_DISPATCHER" } });
    const booking = await createBooking(org, input());
    for (const role of ["OPERATOR_VIEWER", "DRIVER"] as const) {
      await db.organizationMember.updateMany({ where, data: { role } });
      await expect(createBooking(org, input("17:00"))).rejects.toBeInstanceOf(AccessDenied);
      await expect(cancelBooking(org, booking.id, 0)).rejects.toBeInstanceOf(AccessDenied);
    }
    await db.organizationMember.updateMany({ where, data: { active: false } }); await expect(readBookings(org)).rejects.toBeInstanceOf(AccessDenied);
    await db.organizationMember.updateMany({ where, data: { active: true, role: "OPERATOR_OWNER" } }); await releaseAll();
  });
  it("keeps snapshots immutable after catalog changes and audit free of personal data", async () => {
    const db = getDb(), booking = await createBooking(org, input()); await releaseAll();
    await db.service.update({ where: { id: serviceId }, data: { basePriceCents: 12300, meetingPoint: "Changed", pricingType: "PER_GROUP" } });
    const stored = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored.totalPriceCents).toBe(19960); expect(stored.meetingPoint).toBe("Station");
    const group = await createBooking(org, input()); expect(group.totalPriceCents).toBe(12300); await releaseAll();
    const logs = JSON.stringify(await db.auditLog.findMany({ where: { organizationId: org, action: { startsWith: "booking." } } }));
    for (const secret of ["Private", "private@example.test", "+351912345678", "idempotencyKey", "requestHash"]) expect(logs).not.toContain(secret);
  });
});
