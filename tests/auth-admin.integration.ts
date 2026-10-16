import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));

import { getDb } from "../src/lib/db";
import { currentTenant, requireCurrentSuperAdmin, AccessDenied } from "../src/modules/auth";
import { createOperator, getOperator, listMyOrganizations, readMyOrganization, changeOperatorStatus, updateOperator } from "../src/modules/tenants";
import { OperatorConflict } from "../src/modules/tenants/input";

const suffix = randomUUID().replaceAll("-", "");
const adminId = `test-admin-${suffix}`;
const ownerId = `test-owner-${suffix}`;
const outsiderId = `test-outsider-${suffix}`;
const ownerEmail = `owner-${suffix}@example.test`;
const orgIds: string[] = [];
const input = { name: "Integration Tour", slug: `test-tour-${suffix}`, responsibleName: "Test Owner", contactEmail: ownerEmail, contactPhone: "+351 912345678", plan: "MANAGED", setupPaid: false, monthlyPriceCents: 49900, primaryLanguage: "pt" };

beforeAll(async () => {
  const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
  if (!database.pathname.endsWith("_test")) throw new Error("Integration tests require a dedicated DATABASE_URL ending in _test; no production cleanup is allowed.");
  await getDb().user.createMany({ data: [
    { id: adminId, email: `admin-${suffix}@example.test`, platformRole: "SUPER_ADMIN" },
    { id: ownerId, email: ownerEmail },
    { id: outsiderId, email: `outsider-${suffix}@example.test` },
  ] });
});

afterAll(async () => {
  // Delete only fixtures created by this run; never reset or truncate an existing database.
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) return;
  const db = getDb();
  await db.auditLog.deleteMany({ where: { actorId: { in: [adminId, ownerId, outsiderId] } } });
  await db.operatorProfile.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.organizationMember.deleteMany({ where: { organizationId: { in: orgIds } } });
  await db.organization.deleteMany({ where: { id: { in: orgIds } } });
  await db.user.deleteMany({ where: { id: { in: [adminId, ownerId, outsiderId] } } });
  await db.$disconnect();
});

describe("auth, tenant isolation and admin persistence", () => {
  it("rejects anonymous direct reads and writes", async () => {
    session.userId = null;
    await expect(createOperator(input)).rejects.toBeInstanceOf(AccessDenied);
    await expect(getOperator("unknown")).rejects.toBeInstanceOf(AccessDenied);
  });

  it("creates an organization, profile, owner membership and audit atomically", async () => {
    session.userId = adminId;
    const org = await createOperator(input);
    orgIds.push(org.id);
    expect(await getDb().operatorProfile.findUnique({ where: { organizationId: org.id } })).toMatchObject({ status: "LEAD", monthlyPriceCents: 49900 });
    expect(await getDb().organizationMember.findUnique({ where: { organizationId_userId: { organizationId: org.id, userId: ownerId } } })).toMatchObject({ role: "OPERATOR_OWNER" });
    expect(await getDb().auditLog.count({ where: { organizationId: org.id, action: "operator.created" } })).toBe(1);
  });

  it("lists only actual memberships and rejects access from another tenant", async () => {
    const id = orgIds[0]!;
    session.userId = ownerId;
    expect((await listMyOrganizations()).map((member) => member.organizationId)).toEqual([id]);
    expect(await readMyOrganization(id)).toMatchObject({ id });
    await expect(readMyOrganization("other-organization")).rejects.toBeInstanceOf(AccessDenied);
    session.userId = outsiderId;
    expect(await listMyOrganizations()).toEqual([]);
    await expect(currentTenant(id)).rejects.toBeInstanceOf(AccessDenied);
    await expect(getOperator(id)).rejects.toBeInstanceOf(AccessDenied);
    await expect(changeOperatorStatus(id, 0, "CONTRACTED")).rejects.toBeInstanceOf(AccessDenied);
  });

  it("honors role revocation and disabled accounts immediately", async () => {
    const id = orgIds[0]!;
    session.userId = ownerId;
    await getDb().organizationMember.update({ where: { organizationId_userId: { organizationId: id, userId: ownerId } }, data: { active: false } });
    await expect(currentTenant(id)).rejects.toBeInstanceOf(AccessDenied);
    session.userId = adminId;
    await getDb().user.update({ where: { id: adminId }, data: { active: false } });
    await expect(requireCurrentSuperAdmin()).rejects.toBeInstanceOf(AccessDenied);
    await getDb().user.update({ where: { id: adminId }, data: { active: true } });
  });

  it("rolls back duplicate creation including its audit entry", async () => {
    session.userId = adminId;
    const count = await getDb().auditLog.count({ where: { action: "operator.created", actorId: adminId } });
    const email = `rollback-${suffix}@example.test`;
    await expect(createOperator({ ...input, contactEmail: email })).rejects.toBeInstanceOf(OperatorConflict);
    expect(await getDb().user.findUnique({ where: { email } })).toBeNull();
    expect(await getDb().auditLog.count({ where: { action: "operator.created", actorId: adminId } })).toBe(count);
  });

  it("prevents concurrent status changes and records exactly one transition", async () => {
    const id = orgIds[0]!;
    session.userId = adminId;
    const results = await Promise.allSettled([changeOperatorStatus(id, 0, "CONTRACTED"), changeOperatorStatus(id, 0, "SUSPENDED")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await getDb().auditLog.count({ where: { organizationId: id, action: "operator.status.changed" } })).toBe(1);
  });

  it("cannot approve or publish even with a forged admin form submission", async () => {
    const id = orgIds[0]!;
    session.userId = adminId;
    const profile = await getDb().operatorProfile.findUniqueOrThrow({ where: { organizationId: id } });
    await expect(changeOperatorStatus(id, profile.version, "LIVE")).rejects.toThrow();
    expect((await getDb().operatorProfile.findUniqueOrThrow({ where: { organizationId: id } })).status).toBe(profile.status);
    await expect(updateOperator(id, profile.version, { ...input, status: "LIVE" })).rejects.toThrow();
  });
});
