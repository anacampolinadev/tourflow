import "server-only";
import { getDb } from "@/lib/db";
import { auth } from "./session";
import { requireActor, requireSuperAdmin, resolveTenant, type Actor } from "./policy";

export async function currentActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  // Re-read privileges and activation on every request; never accept a role from a form/cookie.
  return getDb().user.findUnique({ where: { id: session.user.id }, select: { id: true, active: true, platformRole: true } });
}

export async function requireCurrentActor() { return requireActor(await currentActor()); }
export async function requireCurrentSuperAdmin() { return requireSuperAdmin(await currentActor()); }

export async function currentTenant(organizationId: string) {
  const actor = await requireCurrentActor();
  const membership = await getDb().organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: actor.id } } });
  return resolveTenant(actor, organizationId, membership);
}
