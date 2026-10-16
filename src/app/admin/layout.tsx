import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/modules/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor?.active) redirect("/login");
  if (actor.platformRole !== "SUPER_ADMIN") redirect("/workspace");
  // Every read and mutation independently checks privileges again in its service.
  return <><nav aria-label="Administração"><Link href="/workspace">TourFlow</Link><Link href="/admin/operators">Operadores</Link></nav>{children}</>;
}
