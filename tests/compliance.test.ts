import { describe, expect, it } from "vitest";
import { AccessDenied, requirePermission, type TenantContext } from "../src/modules/auth/policy";
import { MAX_FILE_BYTES, canApproveDocuments, canGenerateWorkspace, canSubmitDocuments, expiryDate, isDocumentValid, validateUpload, type RequirementSnapshot } from "../src/modules/compliance/domain";
const now = new Date("2026-10-16T23:59:59Z");
const requirement: RequirementSnapshot = { id: "requirement", requiresExpiry: true, document: { id: "document", status: "APPROVED", expiresOn: new Date("2026-10-16T00:00:00Z") } };

describe("compliance gates", () => {
  it("requires an actual checklist, files and a human review before approval", () => {
    expect(canSubmitDocuments("DOCS_PENDING", [])).toBe(false);
    expect(canSubmitDocuments("DOCS_PENDING", [{ ...requirement, document: null }], now)).toBe(false);
    expect(canApproveDocuments("UNDER_REVIEW", [{ ...requirement, document: { ...requirement.document!, status: "PENDING" } }], now)).toBe(false);
    expect(canApproveDocuments("DOCS_PENDING", [requirement], now)).toBe(false);
    expect(canApproveDocuments("UNDER_REVIEW", [requirement], now)).toBe(true);
  });
  it("blocks rejected versions and preserves date-only validity through the UTC day", () => {
    expect(canSubmitDocuments("DOCS_PENDING", [{ ...requirement, document: { ...requirement.document!, status: "REJECTED" } }], now)).toBe(false);
    expect(isDocumentValid(requirement, now)).toBe(true);
    expect(isDocumentValid(requirement, new Date("2026-10-17T00:00:00Z"))).toBe(false);
    expect(isDocumentValid({ ...requirement, document: { ...requirement.document!, expiresOn: null } }, now)).toBe(false);
  });
  it("rechecks expiry and explicit approval markers at the generation gate", () => {
    const profile = { status: "APPROVED" as const, approvedAt: now, approvedById: "admin" };
    expect(canGenerateWorkspace(profile, [requirement], now)).toBe(true);
    expect(canGenerateWorkspace({ ...profile, approvedById: null }, [requirement], now)).toBe(false);
    expect(canGenerateWorkspace(profile, [requirement], new Date("2026-10-17"))).toBe(false);
  });
  it("rejects impossible or malformed expiry dates", () => {
    expect(expiryDate("")).toBeNull();
    expect(expiryDate("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(() => expiryDate("2026-02-30")).toThrow();
    expect(() => expiryDate("16/10/2026")).toThrow();
  });
});
describe("private uploads", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\nTest fixture");
  it("validates extension, MIME and signature together", () => {
    expect(() => validateUpload("document.pdf", "application/pdf", pdf)).not.toThrow();
    expect(() => validateUpload("document.html", "application/pdf", pdf)).toThrow();
    expect(() => validateUpload("document.pdf", "text/html", pdf)).toThrow();
    expect(() => validateUpload("document.pdf", "application/pdf", new TextEncoder().encode("<html>"))).toThrow();
    expect(() => validateUpload("../document.pdf", "application/pdf", pdf)).toThrow();
  });
  it("rejects empty and oversized files", () => {
    expect(() => validateUpload("document.pdf", "application/pdf", new Uint8Array())).toThrow();
    expect(() => validateUpload("document.pdf", "application/pdf", new Uint8Array(MAX_FILE_BYTES + 1))).toThrow();
  });
  it("limits document access to the operator owner", () => {
    const context: TenantContext = { actorId: "user", organizationId: "org", role: "OPERATOR_OWNER" };
    expect(() => requirePermission(context, "compliance:manage")).not.toThrow();
    for (const role of ["OPERATOR_VIEWER", "OPERATOR_DISPATCHER", "DRIVER"] as const) expect(() => requirePermission({ ...context, role }, "compliance:manage")).toThrow(AccessDenied);
  });
});
