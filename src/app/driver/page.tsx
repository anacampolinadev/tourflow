import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/modules/auth";
import { listMyOrganizations } from "@/modules/tenants";
export const dynamic = "force-dynamic";
export default async function DriverEntry() {
  if (!(await currentActor())?.active) redirect("/login");
  const organizations = (await listMyOrganizations()).filter((member) => member.role === "DRIVER");
  if (organizations.length === 1) redirect(`/driver/${organizations[0]!.organizationId}`);
  return <main><h1>Motorista · TourFlow</h1>{organizations.length ? <ul>{organizations.map((member) => <li key={member.organizationId}><Link href={`/driver/${member.organizationId}`}>{member.organization.name}</Link></li>)}</ul> : <p>Sem acesso de motorista atribuído. Contacte o responsável.</p>}<Link href="/workspace">O seu espaço</Link></main>;
}
