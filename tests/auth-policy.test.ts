import { describe, expect, it } from "vitest";
import { AccessDenied, requireSuperAdmin, resolveTenant, requirePermission, memberRoles, type Actor, type Membership } from "../src/modules/auth/policy";

const actor: Actor = { id: "user-a", active: true, platformRole: "USER" };
const membership: Membership = { userId: actor.id, organizationId: "org-a", role: "OPERATOR_OWNER", active: true };

describe("authorization and tenant isolation", () => {
  it("rejects anonymous and disabled users", () => {
    expect(() => resolveTenant(null, "org-a", membership)).toThrow(AccessDenied);
    expect(() => resolveTenant({ ...actor, active: false }, "org-a", membership)).toThrow(AccessDenied);
  });
  it("rejects forged organization identifiers and mismatched memberships", () => {
    expect(() => resolveTenant(actor, "org-b", membership)).toThrow(AccessDenied);
    expect(() => resolveTenant(actor, "org-a", { ...membership, userId: "user-b" })).toThrow(AccessDenied);
    expect(() => resolveTenant(actor, "org-a", null)).toThrow(AccessDenied);
    expect(() => resolveTenant(actor, "org-a", { ...membership, active: false })).toThrow(AccessDenied);
  });
  it("does not silently bypass tenant boundaries for platform admins", () => {
    expect(() => resolveTenant({ ...actor, platformRole: "SUPER_ADMIN" }, "org-b", null)).toThrow(AccessDenied);
  });
  it("requires an active platform administrator", () => {
    expect(() => requireSuperAdmin(actor)).toThrow(AccessDenied);
    expect(() => requireSuperAdmin({ ...actor, platformRole: "SUPER_ADMIN", active: false })).toThrow(AccessDenied);
    expect(requireSuperAdmin({ ...actor, platformRole: "SUPER_ADMIN" }).id).toBe(actor.id);
  });
  it.each(memberRoles)("does not elevate %s to platform admin", (role) => {
    const context = resolveTenant(actor, "org-a", { ...membership, role });
    expect(context.role).toBe(role);
    expect(() => requireSuperAdmin(actor)).toThrow(AccessDenied);
  });
  it("keeps viewer read-only and dispatcher out of membership management", () => {
    const viewer = resolveTenant(actor, "org-a", { ...membership, role: "OPERATOR_VIEWER" });
    expect(() => requirePermission(viewer, "organization:read")).not.toThrow();
    expect(() => requirePermission(viewer, "operations:manage")).toThrow(AccessDenied);
    expect(() => requirePermission(viewer, "members:manage")).toThrow(AccessDenied);
    expect(() => requirePermission(resolveTenant(actor, "org-a", { ...membership, role: "OPERATOR_DISPATCHER" }), "members:manage")).toThrow(AccessDenied);
  });
  it("restricts drivers to their own assignments", () => {
    const driver = resolveTenant(actor, "org-a", { ...membership, role: "DRIVER" });
    expect(() => requirePermission(driver, "assignments:own")).not.toThrow();
    expect(() => requirePermission(driver, "organization:read")).toThrow(AccessDenied);
    expect(() => requirePermission(driver, "operations:manage")).toThrow(AccessDenied);
  });
});
