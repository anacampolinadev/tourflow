import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { getDb } from "../src/lib/db";
import { AccessDenied } from "../src/modules/auth";
import { CatalogConflict, CatalogUnavailable } from "../src/modules/tenants";
import { createService, updateService, getService, listServices } from "../src/modules/services";
import { createVehicle, updateVehicle, getVehicle, listVehicles } from "../src/modules/vehicles";
import { createDriver, updateDriver, getDriver, listDrivers, changeDriverStatus } from "../src/modules/drivers";
const suffix = randomUUID().replaceAll("-", "");
const ownerId = `core-owner-${suffix}`;
const otherId = `core-other-${suffix}`;
const adminId = `core-admin-${suffix}`;
const organizationIds: string[] = [];
let org = "", otherOrg = "", serviceId = "", vehicleId = "", driverId = "";
const service = { name: "Sintra Core", description: "Passeio de teste", durationMinutes: 120, pricingType: "PER_PERSON", basePriceCents: 4990, currency: "EUR", capacity: 6, meetingPoint: "Estação de Sintra", pickupAvailable: false, pickupRules: "", languages: ["pt", "en"], active: false };
const vehicle = { name: "Jipe Core", type: "JEEP", registration: "AA-00-BB", capacity: 6, features: ["AC"], active: false };
const driver = { name: "João Core", phone: "+351 912345678", email: `driver-${suffix}@example.test`, languages: ["pt", "en"] };
async function role(value: "OPERATOR_OWNER" | "OPERATOR_DISPATCHER" | "OPERATOR_VIEWER" | "DRIVER") {
  session.userId = ownerId;
  await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: ownerId }, data: { role: value, active: true } });
}
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required.");
  await getDb().user.createMany({ data: [{ id: ownerId, email: `core-owner-${suffix}@example.test` }, { id: otherId, email: `core-other-${suffix}@example.test` }, { id: adminId, email: `core-admin-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }] });
  for (let index = 0; index < 2; index++) {
    const organization = await getDb().organization.create({ data: { name: `Core test ${index}`, slug: `core-${suffix}-${index}`, members: { create: { userId: ownerId, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test Owner", contactEmail: `core-owner-${suffix}@example.test`, contactPhone: "+351 912345678", plan: "MANAGED", monthlyPriceCents: 49900, status: "ONBOARDING" } } } });
    organizationIds.push(organization.id);
  }
  org = organizationIds[0]!; otherOrg = organizationIds[1]!;
});
afterAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) return;
  const db = getDb();
  await db.service.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.vehicle.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.driver.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: [ownerId, otherId, adminId] } } });
  await db.operatorProfile.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.organizationMember.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, otherId, adminId] } } });
  await db.$disconnect();
});
describe("operator registries in PostgreSQL", () => {
  it("rejects anonymous, outsiders and platform admins without membership", async () => {
    for (const actor of [null, otherId, adminId]) {
      session.userId = actor;
      await expect(listServices(org)).rejects.toBeInstanceOf(AccessDenied);
      await expect(createVehicle(org, vehicle)).rejects.toBeInstanceOf(AccessDenied);
      await expect(createDriver(org, driver)).rejects.toBeInstanceOf(AccessDenied);
    }
  });
  it("creates audited tenant records with safe initial states and no driver account", async () => {
    await role("OPERATOR_OWNER");
    serviceId = (await createService(org, service)).id;
    vehicleId = (await createVehicle(org, vehicle)).id;
    const createdDriver = await createDriver(org, driver); driverId = createdDriver.id;
    expect(createdDriver).toMatchObject({ status: "PENDING", version: 0, organizationId: org });
    expect(await getVehicle(org, vehicleId)).toMatchObject({ registration: "AA00BB", active: false });
    expect(await getDb().user.findUnique({ where: { email: driver.email } })).toBeNull();
    expect(await getDb().auditLog.count({ where: { organizationId: org, action: { in: ["service.created", "vehicle.created", "driver.created"] } } })).toBe(3);
  });
  it("scopes IDs even when the same user owns two operators", async () => {
    expect(await getService(otherOrg, serviceId)).toBeNull();
    expect(await getVehicle(otherOrg, vehicleId)).toBeNull();
    expect(await getDriver(otherOrg, driverId)).toBeNull();
    await expect(updateService(otherOrg, serviceId, 0, service)).rejects.toBeInstanceOf(CatalogConflict);
    await expect(updateVehicle(otherOrg, vehicleId, 0, vehicle)).rejects.toBeInstanceOf(CatalogConflict);
    await expect(changeDriverStatus(otherOrg, driverId, 0, "ACTIVE")).rejects.toBeInstanceOf(CatalogConflict);
    expect((await listDrivers(otherOrg)).items).toHaveLength(0);
  });
  it("normalizes duplicate plates and emails per tenant and rolls back their audit", async () => {
    const count = await getDb().auditLog.count({ where: { organizationId: org } });
    await expect(createVehicle(org, { ...vehicle, registration: "aa 00 bb" })).rejects.toBeInstanceOf(CatalogConflict);
    await expect(createDriver(org, { ...driver, email: driver.email.toUpperCase() })).rejects.toBeInstanceOf(CatalogConflict);
    expect(await getDb().auditLog.count({ where: { organizationId: org } })).toBe(count);
    expect((await createVehicle(otherOrg, vehicle)).organizationId).toBe(otherOrg);
    expect((await createDriver(otherOrg, driver)).organizationId).toBe(otherOrg);
  });
  it("grants dispatcher resource writes while protecting pricing and viewer reads", async () => {
    await role("OPERATOR_DISPATCHER");
    await expect(updateService(org, serviceId, 0, { ...service, basePriceCents: 1 })).rejects.toBeInstanceOf(AccessDenied);
    await updateVehicle(org, vehicleId, 0, { ...vehicle, active: true });
    await updateDriver(org, driverId, 0, { ...driver, name: "João Atualizado" });
    await role("OPERATOR_VIEWER");
    expect((await listVehicles(org)).total).toBe(1);
    await expect(updateDriver(org, driverId, 1, driver)).rejects.toBeInstanceOf(AccessDenied);
    await expect(createService(org, service)).rejects.toBeInstanceOf(AccessDenied);
    await role("DRIVER");
    await expect(listDrivers(org)).rejects.toBeInstanceOf(AccessDenied);
    await role("OPERATOR_OWNER");
  });
  it("revalidates disabled accounts and revoked memberships", async () => {
    await getDb().organizationMember.updateMany({ where: { organizationId: org, userId: ownerId }, data: { active: false } });
    await expect(getService(org, serviceId)).rejects.toBeInstanceOf(AccessDenied);
    await role("OPERATOR_OWNER");
    await getDb().user.update({ where: { id: ownerId }, data: { active: false } });
    await expect(createService(org, service)).rejects.toBeInstanceOf(AccessDenied);
    await getDb().user.update({ where: { id: ownerId }, data: { active: true } });
  });
  it("allows exactly one simultaneous edit and rolls back stale writes", async () => {
    const results = await Promise.allSettled([updateService(org, serviceId, 0, { ...service, basePriceCents: 5500 }), updateService(org, serviceId, 0, { ...service, basePriceCents: 6500 })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await getService(org, serviceId))?.version).toBe(1);
    expect(await getDb().auditLog.count({ where: { organizationId: org, action: "service.updated" } })).toBe(1);
  });
  it("enforces driver lifecycle separately from contact edits", async () => {
    await expect(updateDriver(org, driverId, 1, { ...driver, status: "ACTIVE" })).rejects.toThrow();
    await changeDriverStatus(org, driverId, 1, "ACTIVE");
    await changeDriverStatus(org, driverId, 2, "SUSPENDED");
    await expect(changeDriverStatus(org, driverId, 3, "ACTIVE")).rejects.toThrow();
    await changeDriverStatus(org, driverId, 3, "PENDING");
    expect((await getDriver(org, driverId))?.status).toBe("PENDING");
  });
  it("blocks writes in commercial, restricted and suspended states without invalidating compliance", async () => {
    for (const status of ["LEAD", "CONTRACTED", "RESTRICTED", "SUSPENDED"] as const) {
      await getDb().operatorProfile.update({ where: { organizationId: org }, data: { status } });
      await expect(createService(org, service)).rejects.toBeInstanceOf(CatalogUnavailable);
      await expect(updateVehicle(org, vehicleId, 1, vehicle)).rejects.toBeInstanceOf(CatalogUnavailable);
      await expect(changeDriverStatus(org, driverId, 4, "ACTIVE")).rejects.toBeInstanceOf(CatalogUnavailable);
    }
    await getDb().operatorProfile.update({ where: { organizationId: org }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: adminId } });
    await updateService(org, serviceId, 1, { ...service, active: true });
    expect(await getDb().operatorProfile.findUnique({ where: { organizationId: org } })).toMatchObject({ version: 0, status: "APPROVED", approvedById: adminId });
  });
  it("filters and paginates deterministically without exposing another tenant", async () => {
    await getDb().service.createMany({ data: Array.from({ length: 26 }, (_, index) => ({ ...service, name: `Page fixture ${String(index).padStart(2, "0")}`, pricingType: "PER_PERSON" as const, organizationId: org })) });
    const first = await listServices(org, { search: "Page fixture", active: "inactive", page: 1 });
    const second = await listServices(org, { search: "Page fixture", active: "inactive", page: 2 });
    expect(first.total).toBe(26); expect(first.items).toHaveLength(25); expect(second.items).toHaveLength(1);
    expect(first.items.some((item) => item.id === second.items[0]!.id)).toBe(false);
    expect((await listServices(otherOrg)).total).toBe(0);
    expect((await listVehicles(org, { search: "aa-00-bb", active: "active" })).total).toBe(1);
  });
  it("keeps private contacts, pickup rules and prices out of audit metadata", async () => {
    const logs = await getDb().auditLog.findMany({ where: { organizationId: org } });
    const text = JSON.stringify(logs);
    expect(text).not.toContain(driver.email);
    expect(text).not.toContain(driver.phone);
    expect(text).not.toContain(service.meetingPoint);
    expect(text).not.toContain("basePriceCents");
  });
});
