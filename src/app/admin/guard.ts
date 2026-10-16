import "server-only";
import { redirect } from "next/navigation";
import { currentActor } from "@/modules/auth";

// Layouts and pages can render in parallel; each page handles expected denial before querying.
export async function requireAdminPage() {
  const actor = await currentActor();
  if (!actor?.active) redirect("/login");
  if (actor.platformRole !== "SUPER_ADMIN") redirect("/workspace");
  return actor;
}
