import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { getDb } from "../src/lib/db";
import { AccessDenied } from "../src/modules/auth";
import { readOperatorShell, readOperatorDashboard, readOperatorCustomers, readOperatorReport } from "../src/modules/operator";
import { readBookings } from "../src/modules/bookings";
const suffix = randomUUID(), owner = `dashboard-${suffix}`, outsider = `dashboard-out-${suffix}`, orgs: string[] = [];
const now = new Date("2026-10-25T10:00Z"), date = "2026-10-25";
let org = "", other = "", serviceId = "", driverId = "", vehicleId = "", assignedId = "", confirmedId = "";
async function seedBooking(organizationId: string, startsAt: string, status: "CONFIRMED" | "ASSIGNED" | "CANCELLED", name: string, cents = 2000) {
  const db = getDb();
  const customer = await db.customer.create({ data: { organizationId, name, email: `${name.replaceAll(" ", "-").toLowerCase()}@example.test`, phone: "+351912345678" } });
  const service = organizationId === org ? serviceId : (await db.service.findFirstOrThrow({ where: { organizationId } })).id;
  return db.booking.create({ data: { organizationId, serviceId: service, customerId: customer.id, idempotencyKey: randomUUID(), requestHash: "fixture", status, passengers: 2, startsAt: new Date(startsAt), endsAt: new Date(new Date(startsAt).valueOf() + 3600000), timeZone: "Europe/Lisbon", serviceName: name, pricingType: "PER_GROUP", unitPriceCents: cents, totalPriceCents: cents, currency: "EUR", meetingPoint: "Station", pickupRules: "", pickup: "", notes: "", source: "OPERATOR" } });
}
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required.");
  const db = getDb();
  await db.user.createMany({ data: [{ id: owner, email: `dashboard-${suffix}@example.test` }, { id: outsider, email: `dashboard-out-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }] });
  for (let index = 0; index < 2; index++) {
    const row = await db.organization.create({ data: { name: `Dashboard ${index}`, slug: `dashboard-${suffix}-${index}`, timeZone: "Europe/Lisbon", members: { create: { userId: owner, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: "test@example.test", contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "APPROVED", approvedAt: now, approvedById: owner } } } }); orgs.push(row.id);
    const service = await db.service.create({ data: { organizationId: row.id, name: "Dashboard Tour", description: "", durationMinutes: 60, pricingType: "PER_GROUP", basePriceCents: 2000, capacity: 4, meetingPoint: "Station", languages: ["pt"], active: true } }); if (index === 0) serviceId = service.id;
  }
  org = orgs[0]!; other = orgs[1]!; session.userId = owner;
  await db.complianceRequirement.create({ data: { organizationId: org, title: "Private document title", requiresExpiry: true, documents: { create: { revision: 1, fileName: "private.pdf", mimeType: "application/pdf", size: 5, sha256: "fixture", data: Buffer.from("%PDF-"), uploadedById: owner, status: "APPROVED", expiresOn: new Date("2026-10-27T00:00Z") } } } });
  driverId = (await db.driver.create({ data: { organizationId: org, name: "Dashboard Driver", email: `driver-${suffix}@example.test`, phone: "+351912345678", languages: ["pt"], status: "ACTIVE" } })).id;
  vehicleId = (await db.vehicle.create({ data: { organizationId: org, name: "Dashboard Car", type: "CAR", registration: "DASH001", capacity: 4, features: [], active: true } })).id;
  await db.driverAvailability.createMany({ data: [{ organizationId: org, driverId, startsAt: new Date("2026-10-25T08:00Z"), endsAt: new Date("2026-10-25T10:00Z") }, { organizationId: org, driverId, startsAt: new Date("2026-10-25T11:00Z"), endsAt: new Date("2026-10-25T13:00Z") }] });
  await seedBooking(org, "2026-10-24T22:59:59.999Z", "CONFIRMED", "Previous day");
  confirmedId = (await seedBooking(org, "2026-10-24T23:00Z", "CONFIRMED", "Day start")).id;
  assignedId = (await seedBooking(org, "2026-10-25T11:00Z", "ASSIGNED", "Next Tour", 4990)).id;
  await seedBooking(org, "2026-10-25T23:59:59.999Z", "CANCELLED", "Cancelled Tour", 99999);
  await seedBooking(org, "2026-10-26T00:00Z", "CONFIRMED", "Next day");
  await seedBooking(other, "2026-10-25T12:00Z", "CONFIRMED", "Secret Other Customer", 90000);
  await db.dispatchDecision.create({ data: { organizationId: org, bookingId: assignedId, actorId: owner, idempotencyKey: randomUUID(), requestHash: "fixture", bookingVersion: 1, mode: "AUTO", outcome: "NO_CANDIDATE", factors: {}, reason: "No driver fixture" } });
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
describe("operator read models", () => {
  it("rejects anonymous, other users and global admins without membership for every read", async () => {
    for (const userId of [null, outsider]) { session.userId = userId; for (const read of [() => readOperatorShell(org), () => readOperatorDashboard(org, {}, now), () => readOperatorCustomers(org), () => readOperatorReport(org, undefined, now)]) await expect(read()).rejects.toBeInstanceOf(AccessDenied); }
    session.userId = owner;
  });
  it("uses the full 25-hour local day, exact boundaries, uncropped totals and distinct drivers", async () => {
    const result = await readOperatorDashboard(org, { date }, now);
    expect(result.stats).toEqual({ total: 2, confirmed: 1, assigned: 1, cancelled: 1, driversWithWindows: 1 });
    expect(result.next?.id).toBe(assignedId); expect(result.bookings.map((row) => row.serviceName)).toEqual(["Day start", "Next Tour", "Cancelled Tour"]);
    expect(result.problemCount).toBe(1); expect(result.problems[0]?.id).toBe(assignedId);
    expect(result.canCreateTestBooking).toBe(true); expect(result.nearExpiry).toBe(1);
  });
  it("clears an old failed dispatch after a later successful decision and ignores cancellations", async () => {
    const db = getDb();
    await db.dispatchDecision.create({ data: { organizationId: org, bookingId: assignedId, actorId: owner, idempotencyKey: randomUUID(), requestHash: "fixture", bookingVersion: 2, mode: "AUTO", outcome: "ASSIGNED", driverId, vehicleId, score: 8000, factors: {}, reason: "Resolved" } });
    expect((await readOperatorDashboard(org, { date }, now)).problemCount).toBe(0);
    await db.booking.update({ where: { id: assignedId }, data: { status: "CANCELLED" } });
    expect((await readOperatorDashboard(org, { date }, now)).next).toBeNull();
    await db.booking.update({ where: { id: assignedId }, data: { status: "ASSIGNED" } });
  });
  it("reports exact integer cents, excludes cancelled value and supplies zero rows for empty dates", async () => {
    const result = await readOperatorReport(org, { from: date, until: "2026-10-26" }, now);
    expect(result.days).toHaveLength(2); expect(result.days[0]).toMatchObject({ active: 2, assigned: 1, cancelled: 1, passengers: 4, valueCents: 6990n });
    expect(result.totals).toEqual({ active: 3, assigned: 1, cancelled: 1, passengers: 6, valueCents: 8990n });
    expect((await readOperatorReport(org, { from: "2026-10-27", until: "2026-10-28" }, now)).days.every((day) => day.active === 0 && day.valueCents === 0n)).toBe(true);
    await expect(readOperatorReport(org, { from: date, until: "2026-12-01" }, now)).rejects.toThrow();
  });
  it("never joins another tenant's contacts, metrics or report values", async () => {
    const data = await readOperatorCustomers(org, { search: "Secret Other" }); expect(data.total).toBe(0);
    expect((await readOperatorReport(other, { from: date, until: date }, now)).totals.valueCents).toBe(90000n);
    expect((await readOperatorDashboard(org, { date }, now)).stats.total).toBe(2);
    expect(JSON.stringify(await readOperatorCustomers(org))).not.toContain("Secret Other");
  });
  it("filters reservations by local date, status, customer and exact booking id", async () => {
    expect((await readBookings(org, 1, { date, status: "CONFIRMED" })).bookings.map((row) => row.id)).toEqual([confirmedId]);
    expect((await readBookings(org, 1, { search: assignedId })).bookings.map((row) => row.id)).toEqual([assignedId]);
    expect((await readBookings(org, 1, { search: "next tour" })).bookings.map((row) => row.id)).toEqual([assignedId]);
    expect((await readBookings(org, 1, { search: "Secret Other" })).bookings).toEqual([]);
  });
  it("paginates contacts and the day list without cropping summary totals", async () => {
    for (let n = 0; n < 21; n++) await seedBooking(org, `2026-10-25T15:${String(n).padStart(2, "0")}Z`, "CONFIRMED", `Paginated ${n}`);
    const first = await readOperatorDashboard(org, { date }, now), second = await readOperatorDashboard(org, { date, page: 2 }, now);
    expect(first.stats.total).toBe(23); expect(second.stats.total).toBe(23); expect(first.bookings).toHaveLength(20); expect(second.bookings).toHaveLength(4);
    const overlap = new Set(first.bookings.map((row) => row.id)); expect(second.bookings.some((row) => overlap.has(row.id))).toBe(false);
    expect((await readOperatorCustomers(org, { search: "Paginated" })).customers).toHaveLength(20);
    expect((await readOperatorCustomers(org, { search: "Paginated", page: 2 })).customers).toHaveLength(1);
  });
  it("shows document health without returning document bytes, names or review metadata", async () => {
    const db = getDb(); await db.complianceDocument.updateMany({ where: { organizationId: org }, data: { status: "REJECTED" } });
    const result = await readOperatorDashboard(org, { date }, now); expect(result.canCreateTestBooking).toBe(false); expect(result.attentionDocuments).toBe(1);
    const serialized = JSON.stringify(result); for (const secret of ["private.pdf", "Private document title", "sha256", "mimeType"]) expect(serialized).not.toContain(secret);
    await db.complianceDocument.updateMany({ where: { organizationId: org }, data: { status: "APPROVED" } });
    await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "SUSPENDED" } }); expect((await readOperatorDashboard(org, { date }, now)).canCreateTestBooking).toBe(false);
    await db.operatorProfile.update({ where: { organizationId: org }, data: { status: "APPROVED" } });
  });
  it("allows dispatcher/viewer read-only projections, denies driver/revoked accounts and creates no audit events", async () => {
    const db = getDb(), before = await db.auditLog.count({ where: { organizationId: org } });
    for (const role of ["OPERATOR_DISPATCHER", "OPERATOR_VIEWER"] as const) {
      await db.organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { role } });
      await readOperatorDashboard(org, { date }, now); await readOperatorCustomers(org); await readOperatorReport(org, undefined, now);
    }
    expect(await db.auditLog.count({ where: { organizationId: org } })).toBe(before);
    await db.organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { role: "DRIVER" } }); await expect(readOperatorDashboard(org)).rejects.toBeInstanceOf(AccessDenied);
    await db.organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { role: "OPERATOR_OWNER", active: false } }); await expect(readOperatorCustomers(org)).rejects.toBeInstanceOf(AccessDenied);
    await db.organizationMember.updateMany({ where: { organizationId: org, userId: owner }, data: { active: true } });
    await db.user.update({ where: { id: owner }, data: { active: false } }); await expect(readOperatorReport(org)).rejects.toBeInstanceOf(AccessDenied);
  });
});
