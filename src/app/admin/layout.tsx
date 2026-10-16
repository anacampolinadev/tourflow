import Link from "next/link";
import { requireAdminPage } from "./guard";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  // Every read and mutation independently checks privileges again in its service.
  return <><nav aria-label="Administração"><Link href="/workspace">TourFlow</Link><Link href="/admin/operators">Operadores</Link></nav>{children}</>;
}
