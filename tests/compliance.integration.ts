import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { getDb } from "../src/lib/db";
import { AccessDenied } from "../src/modules/auth";
import { createOperator, updateOperator, changeOperatorStatus, OperatorConflict } from "../src/modules/tenants";
import { addRequirement, deactivateRequirement, uploadDocument, readCompliance, submitDocuments, reviewDocument, requestCorrections, approveOperator, downloadDocument, canGenerateWorkspace } from "../src/modules/compliance";
const suffix = randomUUID().replaceAll("-", "");
const adminId = `compliance-admin-${suffix}`;
const ownerId = `compliance-owner-${suffix}`;
const outsiderId = `compliance-outsider-${suffix}`;
const email = `compliance-owner-${suffix}@example.test`;
let organizationId = "";
let requirementId = "";
let documentId = "";
let replacementId = "";
const input = { name: "Compliance Tour", responsibleName: "Owner", contactEmail: email, contactPhone: "+351 912345678", plan: "MANAGED", setupPaid: true, monthlyPriceCents: 49900, primaryLanguage: "pt" };
const bytes = new TextEncoder().encode("%PDF-1.7\nSynthetic test fixture");
const upload = () => ({ requirementId, fileName: "document.pdf", mimeType: "application/pdf", bytes, expiresOn: "2099-12-31" });
const version = async () => (await getDb().operatorProfile.findUniqueOrThrow({ where: { organizationId } })).version;
const asAdmin = () => { session.userId = adminId; };
const asOwner = () => { session.userId = ownerId; };

beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required.");
  await getDb().user.createMany({ data: [{ id: adminId, email: `compliance-admin-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }, { id: ownerId, email }, { id: outsiderId, email: `compliance-outsider-${suffix}@example.test` }] });
  asAdmin();
  organizationId = (await createOperator({ ...input, slug: `compliance-${suffix}` })).id;
  await changeOperatorStatus(organizationId, await version(), "CONTRACTED");
  await changeOperatorStatus(organizationId, await version(), "ONBOARDING");
});
afterAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) return;
  const db = getDb();
  await db.complianceReview.deleteMany({ where: { organizationId } });
  await db.complianceDocument.deleteMany({ where: { organizationId } });
  await db.complianceRequirement.deleteMany({ where: { organizationId } });
  await db.auditLog.deleteMany({ where: { actorId: { in: [adminId, ownerId, outsiderId] } } });
  await db.operatorProfile.deleteMany({ where: { organizationId } });
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { id: { in: [adminId, ownerId, outsiderId] } } });
  await db.$disconnect();
});

describe("private document lifecycle in PostgreSQL", () => {
  it("rejects anonymous, non-members, owners on admin paths and inactive memberships", async () => {
    session.userId = null;
    await expect(readCompliance(organizationId, "owner")).rejects.toBeInstanceOf(AccessDenied);
    session.userId = outsiderId;
    await expect(readCompliance(organizationId, "owner")).rejects.toBeInstanceOf(AccessDenied);
    asOwner();
    await expect(addRequirement(organizationId, await version(), { title: "Identity", requiresExpiry: true })).rejects.toBeInstanceOf(AccessDenied);
    await getDb().organizationMember.updateMany({ where: { organizationId, userId: ownerId }, data: { active: false } });
    await expect(readCompliance(organizationId, "owner")).rejects.toBeInstanceOf(AccessDenied);
    await getDb().organizationMember.updateMany({ where: { organizationId, userId: ownerId }, data: { active: true } });
  });
  it("defines a checklist explicitly and cannot submit without a file", async () => {
    asAdmin();
    requirementId = (await addRequirement(organizationId, await version(), { title: "Identity document", requiresExpiry: true })).id;
    expect((await readCompliance(organizationId, "admin"))?.profile.status).toBe("DOCS_PENDING");
    asOwner();
    await expect(submitDocuments(organizationId, await version())).rejects.toThrow();
  });
  it("rolls back invalid files and protects foreign requirement references", async () => {
    asOwner();
    const before = await version();
    await expect(uploadDocument(organizationId, before, { ...upload(), requirementId: "foreign-id" })).rejects.toThrow();
    await expect(uploadDocument(organizationId, before, { ...upload(), expiresOn: "2020-01-01" })).rejects.toThrow();
    await expect(uploadDocument(organizationId, before, { ...upload(), bytes: new TextEncoder().encode("html") })).rejects.toThrow();
    expect(await version()).toBe(before);
    expect(await getDb().complianceDocument.count({ where: { organizationId } })).toBe(0);
  });
  it("stores private bytes with a digest and enforces membership roles on download", async () => {
    asOwner();
    documentId = (await uploadDocument(organizationId, await version(), upload())).id;
    expect((await downloadDocument(organizationId, documentId, "owner"))?.data).toEqual(bytes);
    expect(await downloadDocument(organizationId, "foreign-id", "owner")).toBeNull();
    session.userId = outsiderId;
    await expect(downloadDocument(organizationId, documentId, "owner")).rejects.toBeInstanceOf(AccessDenied);
    asOwner();
    for (const role of ["OPERATOR_VIEWER", "OPERATOR_DISPATCHER", "DRIVER"] as const) {
      await getDb().organizationMember.updateMany({ where: { organizationId, userId: ownerId }, data: { role } });
      await expect(downloadDocument(organizationId, documentId, "owner")).rejects.toBeInstanceOf(AccessDenied);
    }
    await getDb().organizationMember.updateMany({ where: { organizationId, userId: ownerId }, data: { role: "OPERATOR_OWNER" } });
  });
  it("submits, freezes uploads/identity edits, and requires individual reviews", async () => {
    asOwner();
    await submitDocuments(organizationId, await version());
    await expect(uploadDocument(organizationId, await version(), upload())).rejects.toThrow();
    asAdmin();
    await expect(updateOperator(organizationId, await version(), { ...input, responsibleName: "Changed" })).rejects.toThrow();
    await expect(approveOperator(organizationId, await version())).rejects.toThrow();
    expect((await readCompliance(organizationId, "admin"))?.requirements[0]?.document?.status).toBe("UNDER_REVIEW");
  });
  it("rejection reopens the checklist and requires a replacement version", async () => {
    asAdmin();
    await expect(reviewDocument(organizationId, await version(), documentId, "REJECTED", "")).rejects.toThrow();
    await reviewDocument(organizationId, await version(), documentId, "REJECTED", "Please send a legible copy.");
    asOwner();
    const data = await readCompliance(organizationId, "owner");
    expect(data?.profile).toMatchObject({ status: "DOCS_PENDING", complianceNote: "Please send a legible copy." });
    await expect(submitDocuments(organizationId, await version())).rejects.toThrow();
    replacementId = (await uploadDocument(organizationId, await version(), upload())).id;
    expect((await readCompliance(organizationId, "owner"))?.requirements[0]?.history).toHaveLength(2);
    await submitDocuments(organizationId, await version());
  });
  it("rejects historical reviews and permits only one concurrent final approval", async () => {
    asAdmin();
    await expect(reviewDocument(organizationId, await version(), documentId, "APPROVED", null)).rejects.toThrow();
    await reviewDocument(organizationId, await version(), replacementId, "APPROVED", null);
    const before = await version();
    const results = await Promise.allSettled([approveOperator(organizationId, before), approveOperator(organizationId, before)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: expect.any(OperatorConflict) });
    const data = await readCompliance(organizationId, "admin");
    expect(data?.profile).toMatchObject({ status: "APPROVED", approvedById: adminId });
    expect(data?.canGenerate).toBe(true);
    expect(await getDb().auditLog.count({ where: { organizationId, action: "compliance.approved" } })).toBe(1);
    await expect(changeOperatorStatus(organizationId, await version(), "GENERATING")).rejects.toThrow();
  });
  it("expiry invalidates the generation gate without erasing the human approval history", async () => {
    asAdmin();
    const data = await readCompliance(organizationId, "admin");
    expect(data && canGenerateWorkspace(data.profile, data.requirements, new Date("2100-01-01"))).toBe(false);
    await requestCorrections(organizationId, await version(), "Renew the expiring document.");
    expect((await readCompliance(organizationId, "admin"))?.profile).toMatchObject({ status: "DOCS_PENDING", approvedAt: null, approvedById: null });
    expect(await getDb().complianceReview.count({ where: { organizationId } })).toBe(2);
    const fields = input;
    await updateOperator(organizationId, await version(), { ...fields, responsibleName: "New responsible" });
  });
  it("keeps audit logs free of document names, contents and review observations", async () => {
    const logs = await getDb().auditLog.findMany({ where: { organizationId, action: { startsWith: "compliance." } } });
    expect(logs.length).toBeGreaterThan(5);
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain("document.pdf");
    expect(serialized).not.toContain("Synthetic test fixture");
    expect(serialized).not.toContain("legible");
  });
  it("enforces tenant consistency in foreign keys even outside the service", async () => {
    await expect(getDb().complianceDocument.create({ data: { organizationId: "another-tenant", requirementId, revision: 99, fileName: "document.pdf", mimeType: "application/pdf", size: bytes.length, sha256: "test", data: bytes, uploadedById: ownerId } })).rejects.toThrow();
  });
  it("retains deactivated requirements and rejects an empty checklist", async () => {
    asAdmin();
    await deactivateRequirement(organizationId, await version(), requirementId);
    asOwner();
    await expect(submitDocuments(organizationId, await version())).rejects.toThrow();
    expect(await getDb().complianceDocument.count({ where: { organizationId } })).toBe(2);
  });
});


it("enforces total archive byte and version quotas without consuming a version on failure", async () => {
  asAdmin();
  const requirement = await addRequirement(organizationId, await version(), { title: "Quota fixture", requiresExpiry: false });
  const large = new Uint8Array(2 * 1024 * 1024);
  large.set(bytes);
  const fixture = (revision: number, data: Uint8Array<ArrayBuffer>) => ({ organizationId, requirementId: requirement.id, revision, fileName: "quota.pdf", mimeType: "application/pdf", size: data.length, sha256: "fixture", data, uploadedById: ownerId });
  try {
    await getDb().complianceDocument.createMany({ data: Array.from({ length: 12 }, (_, index) => fixture(index + 1, large)) });
    asOwner();
    const before = await version();
    await expect(uploadDocument(organizationId, before, { ...upload(), requirementId: requirement.id, bytes: large })).rejects.toThrow("Limite de arquivo");
    expect(await version()).toBe(before);
    await getDb().complianceDocument.deleteMany({ where: { organizationId, requirementId: requirement.id } });
    await getDb().complianceDocument.createMany({ data: Array.from({ length: 48 }, (_, index) => fixture(index + 1, bytes)) });
    await expect(uploadDocument(organizationId, before, { ...upload(), requirementId: requirement.id })).rejects.toThrow("Limite de arquivo");
    expect(await version()).toBe(before);
  } finally {
    await getDb().complianceDocument.deleteMany({ where: { organizationId, requirementId: requirement.id } });
  }
});
