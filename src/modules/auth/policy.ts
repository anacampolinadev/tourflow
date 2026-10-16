export const memberRoles = ["OPERATOR_OWNER", "OPERATOR_DISPATCHER", "OPERATOR_VIEWER", "DRIVER"] as const;
export type MemberRole = (typeof memberRoles)[number];
export type Actor = Readonly<{ id: string; active: boolean; platformRole: "SUPER_ADMIN" | "USER" }>;
export type Membership = Readonly<{ userId: string; organizationId: string; role: MemberRole; active: boolean }>;
export type TenantContext = Readonly<{ actorId: string; organizationId: string; role: MemberRole }>;

export class AccessDenied extends Error {
  constructor() { super("Acesso não autorizado."); this.name = "AccessDenied"; }
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor?.active) throw new AccessDenied();
  return actor;
}

export function requireSuperAdmin(actor: Actor | null): Actor {
  const user = requireActor(actor);
  if (user.platformRole !== "SUPER_ADMIN") throw new AccessDenied();
  return user;
}

// Platform admins use an explicit audited admin path; membership is never inferred.
export function resolveTenant(actor: Actor | null, organizationId: string, membership: Membership | null): TenantContext {
  const user = requireActor(actor);
  if (!membership?.active || membership.userId !== user.id || membership.organizationId !== organizationId) throw new AccessDenied();
  return { actorId: user.id, organizationId, role: membership.role };
}

export type Permission = "organization:read" | "members:manage" | "operations:manage" | "assignments:own" | "compliance:manage" | "catalog:manage" | "resources:manage";
const permissions: Record<MemberRole, readonly Permission[]> = {
  OPERATOR_OWNER: ["organization:read", "members:manage", "operations:manage", "compliance:manage", "catalog:manage", "resources:manage"],
  OPERATOR_DISPATCHER: ["organization:read", "operations:manage", "resources:manage"],
  OPERATOR_VIEWER: ["organization:read"],
  DRIVER: ["assignments:own"],
};

export function requirePermission(context: TenantContext, permission: Permission): void {
  if (!permissions[context.role].includes(permission)) throw new AccessDenied();
}
