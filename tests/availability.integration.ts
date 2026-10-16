import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { getDb } from "../src/lib/db";
import { AccessDenied } from "../src/modules/auth";
import { CatalogConflict, CatalogUnavailable } from "../src/modules/tenants";
import { addServiceSchedule, linkServiceVehicle, addDriverWindow, addResourceBlock, deactivateCalendarEntry, setCalendarTimeZone, checkAvailability, readCalendar } from "../src/modules/availability";
const suffix = randomUUID().replaceAll("-", ""), ownerId = `cal-owner-${suffix}`, outsiderId = `cal-other-${suffix}`, adminId = `cal-admin-${suffix}`;
const orgs: string[] = [];
let org = "", otherOrg = "", serviceId = "", vehicleId = "", driverId = "", scheduleId = "", windowId = "", linkId = "";
const date = Temporal.Now.plainDateISO("Europe/Lisbon").add({ days: 10 }).toString();
const version = async () => (await getDb().operatorProfile.findUniqueOrThrow({ where: { organizationId: org } })).calendarVersion;
const schedule = () => ({ serviceId, weekday: Temporal.PlainDate.from(date).dayOfWeek, time: "10:00", validFrom: date, validUntil: Temporal.PlainDate.from(date).add({ days: 30 }).toString(), bufferBeforeMinutes: 15, bufferAfterMinutes: 15 });
const query = () => ({ serviceId, date, time: "10:00", passengers: 4, language: "en" });
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required.");
  const db = getDb();
  await db.user.createMany({ data: [{ id: ownerId, email: `cal-owner-${suffix}@example.test` }, { id: outsiderId, email: `cal-other-${suffix}@example.test` }, { id: adminId, email: `cal-admin-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }] });
  for (let index = 0; index < 2; index++) {
    const row = await db.organization.create({ data: { name: `Calendar ${index}`, slug: `calendar-${suffix}-${index}`, members: { create: { userId: ownerId, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test owner", contactEmail: `cal-owner-${suffix}@example.test`, contactPhone: "+351 912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "ONBOARDING" } } } }); orgs.push(row.id);
  }
  org = orgs[0]!; otherOrg = orgs[1]!;
  serviceId = (await db.service.create({ data: { organizationId: org, name: "Calendar Tour", description: "", durationMinutes: 120, pricingType: "PER_PERSON", basePriceCents: 4990, capacity: 6, meetingPoint: "Sintra", languages: ["pt", "en"], active: true } })).id;
  vehicleId = (await db.vehicle.create({ data: { organizationId: org, name: "Calendar Jeep", registration: "CAL001", type: "JEEP", capacity: 6, features: [], active: true } })).id;
  driverId = (await db.driver.create({ data: { organizationId: org, name: "Calendar Driver", email: `cal-driver-${suffix}@example.test`, phone: "+351 912345678", languages: ["pt", "en"], status: "ACTIVE" } })).id;
});
afterAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) return;
  const db = getDb(), where = { organizationId: { in: orgs } };
  await db.resourceBlock.deleteMany({ where }); await db.driverAvailability.deleteMany({ where }); await db.serviceVehicle.deleteMany({ where }); await db.serviceSchedule.deleteMany({ where });
  await db.service.deleteMany({ where }); await db.vehicle.deleteMany({ where }); await db.driver.deleteMany({ where });
  await db.auditLog.deleteMany({ where: { actorId: { in: [ownerId, outsiderId, adminId] } } });
  await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, outsiderId, adminId] } } }); await db.$disconnect();
});
describe("calendar persistence and isolation", () => {
  it("rejects anonymous, outsiders and global admins without tenant membership", async () => {
    for (const actor of [null, outsiderId, adminId]) {
      session.userId = actor;
      await expect(checkAvailability(org, query())).rejects.toBeInstanceOf(AccessDenied);
      await expect(addServiceSchedule(org, 0, schedule())).rejects.toBeInstanceOf(AccessDenied);
    }
    session.userId = ownerId;
  });
  it("requires explicit schedules, compatibility and driver windows before returning availability", async () => {
    expect((await checkAvailability(org, query())).reason).toBe("OUTSIDE_SCHEDULE");
    scheduleId = (await addServiceSchedule(org, await version(), schedule())).id;
    expect((await checkAvailability(org, query())).reason).toBe("NO_VEHICLE");
    linkId = (await linkServiceVehicle(org, await version(), { serviceId, vehicleId })).id;
    expect((await checkAvailability(org, query())).reason).toBe("NO_DRIVER");
    windowId = (await addDriverWindow(org, await version(), { driverId, startLocal: `${date}T08:00`, endLocal: `${date}T18:00` })).id;
    const result = await checkAvailability(org, query());
    expect(result).toMatchObject({ mode: "PLANNING", available: true, eligibleVehicles: [{ id: vehicleId, name: "Calendar Jeep" }], eligibleDrivers: [{ id: driverId, name: "Calendar Driver" }] });
  });
  it("does not create holds, change approval or log private query details", async () => {
    const before = await getDb().auditLog.count({ where: { organizationId: org } });
    await checkAvailability(org, query()); await checkAvailability(org, query());
    expect(await getDb().auditLog.count({ where: { organizationId: org } })).toBe(before);
    expect(await getDb().operatorProfile.findUnique({ where: { organizationId: org } })).toMatchObject({ status: "ONBOARDING", version: 0, approvedAt: null });
  });
  it("rejects overlapping schedules/windows and rolls back version and audit", async () => {
    const before = await version();
    await expect(addServiceSchedule(org, before, schedule())).rejects.toThrow("Já existe");
    await expect(addDriverWindow(org, before, { driverId, startLocal: `${date}T09:00`, endLocal: `${date}T12:00` })).rejects.toThrow("sobrepõe");
    expect(await version()).toBe(before);
  });
  it("protects every resource reference even for an owner of two operators", async () => {
    const otherVersion = (await getDb().operatorProfile.findUniqueOrThrow({ where: { organizationId: otherOrg } })).calendarVersion;
    await expect(linkServiceVehicle(otherOrg, otherVersion, { serviceId, vehicleId })).rejects.toBeInstanceOf(CatalogConflict);
    await expect(addServiceSchedule(otherOrg, otherVersion, schedule())).rejects.toBeInstanceOf(CatalogConflict);
    await expect(addDriverWindow(otherOrg, otherVersion, { driverId, startLocal: `${date}T08:00`, endLocal: `${date}T18:00` })).rejects.toBeInstanceOf(CatalogConflict);
    await expect(addResourceBlock(otherOrg, otherVersion, { resourceType: "vehicle", resourceId: vehicleId, startLocal: `${date}T08:00`, endLocal: `${date}T18:00`, reason: "Foreign fixture" })).rejects.toBeInstanceOf(CatalogConflict);
    expect((await checkAvailability(otherOrg, query())).reason).toBe("SERVICE_UNAVAILABLE");
  });
  it("honors a block, offers an actually free alternative and retains cancellation history", async () => {
    await addServiceSchedule(org, await version(), { ...schedule(), time: "14:00" });
    const block = await addResourceBlock(org, await version(), { resourceType: "vehicle", resourceId: vehicleId, startLocal: `${date}T09:50`, endLocal: `${date}T10:00`, reason: "Maintenance fixture" });
    const result = await checkAvailability(org, query());
    expect(result.reason).toBe("NO_VEHICLE"); expect(result.alternatives.map((row) => row.time)).toContain("14:00");
    await deactivateCalendarEntry(org, await version(), "block", block.id);
    expect((await checkAvailability(org, query())).available).toBe(true);
    expect(await getDb().resourceBlock.findUnique({ where: { id: block.id } })).toMatchObject({ active: false });
  });
  it("permits only one concurrent calendar edit for the displayed version", async () => {
    const before = await version();
    const input = { resourceType: "driver", resourceId: driverId, startLocal: `${date}T12:30`, endLocal: `${date}T13:00`, reason: "Break fixture" };
    const results = await Promise.allSettled([addResourceBlock(org, before, input), addResourceBlock(org, before, input)]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(await version()).toBe(before + 1);
  });
  it("enforces dispatcher versus owner settings, current membership and viewer read-only", async () => {
    const db = getDb();
    await db.organizationMember.updateMany({ where: { organizationId: org, userId: ownerId }, data: { role: "OPERATOR_DISPATCHER" } });
    await expect(addServiceSchedule(org, await version(), { ...schedule(), time: "16:00" })).rejects.toBeInstanceOf(AccessDenied);
    await expect(setCalendarTimeZone(org, await version(), "UTC")).rejects.toBeInstanceOf(AccessDenied);
    const block = await addResourceBlock(org, await version(), { resourceType: "driver", resourceId: driverId, startLocal: `${date}T18:30`, endLocal: `${date}T19:00`, reason: "Dispatcher fixture" });
    await deactivateCalendarEntry(org, await version(), "block", block.id);
    await db.organizationMember.updateMany({ where: { organizationId: org, userId: ownerId }, data: { role: "OPERATOR_VIEWER" } });
    expect((await readCalendar(org, date))?.organization.timeZone).toBe("Europe/Lisbon");
    await expect(deactivateCalendarEntry(org, await version(), "window", windowId)).rejects.toBeInstanceOf(AccessDenied);
    await db.organizationMember.updateMany({ where: { organizationId: org, userId: ownerId }, data: { active: false } });
    await expect(checkAvailability(org, query())).rejects.toBeInstanceOf(AccessDenied);
    await db.organizationMember.updateMany({ where: { organizationId: org, userId: ownerId }, data: { role: "OPERATOR_OWNER", active: true } });
  });
  it("rechecks inactive resources and suspended operators on each query and write", async () => {
    const db = getDb();
    await db.vehicle.update({ where: { id: vehicleId }, data: { active: false } });
    expect((await checkAvailability(org, query())).reason).toBe("NO_VEHICLE");
    await db.vehicle.update({ where: { id: vehicleId }, data: { active: true } });
    await db.driver.update({ where: { id: driverId }, data: { status: "INACTIVE" } });
    expect((await checkAvailability(org, query())).reason).toBe("NO_DRIVER");
    await db.driver.update({ where: { id: driverId }, data: { status: "ACTIVE" } });
    await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "SUSPENDED" } });
    expect((await checkAvailability(org, query())).reason).toBe("OPERATOR_UNAVAILABLE");
    await expect(deactivateCalendarEntry(org, await version(), "schedule", scheduleId)).rejects.toBeInstanceOf(CatalogUnavailable);
    await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "ONBOARDING" } });
  });
  it("uses composite FKs and interval/target checks even outside the application", async () => {
    const db = getDb(), start = new Date(`${date}T10:00Z`), end = new Date(`${date}T12:00Z`);
    await expect(db.resourceBlock.create({ data: { organizationId: otherOrg, vehicleId, startsAt: start, endsAt: end, reason: "Foreign fixture" } })).rejects.toThrow();
    await expect(db.resourceBlock.create({ data: { organizationId: org, driverId, vehicleId, startsAt: start, endsAt: end, reason: "Both targets" } })).rejects.toThrow();
    await expect(db.resourceBlock.create({ data: { organizationId: org, startsAt: start, endsAt: end, reason: "No target" } })).rejects.toThrow();
    await expect(db.driverAvailability.create({ data: { organizationId: org, driverId, startsAt: end, endsAt: start } })).rejects.toThrow();
  });
  it("preserves instants when the owner changes zone and excludes private notes from audit", async () => {
    const before = await getDb().driverAvailability.findUniqueOrThrow({ where: { id: windowId } });
    await setCalendarTimeZone(org, await version(), "UTC");
    expect((await getDb().driverAvailability.findUniqueOrThrow({ where: { id: windowId } })).startsAt).toEqual(before.startsAt);
    const logs = await getDb().auditLog.findMany({ where: { organizationId: org, action: { startsWith: "calendar." } } });
    expect(logs.length).toBeGreaterThan(5); expect(JSON.stringify(logs)).not.toContain("fixture");
    expect(logs.some((row) => JSON.stringify(row.metadata).includes(windowId))).toBe(true);
    await deactivateCalendarEntry(org, await version(), "link", linkId);
    expect((await checkAvailability(org, query())).reason).toBe("NO_VEHICLE");
  });
});
