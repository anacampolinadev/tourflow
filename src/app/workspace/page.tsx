import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor, signOut } from "@/modules/auth";
import { listMyOrganizations } from "@/modules/tenants";

export const dynamic = "force-dynamic";

export default async function Workspace() {
  const actor = await currentActor();
  if (!actor?.active) redirect("/login");
  const organizations = await listMyOrganizations();
  return <main>
    <h1>O seu espaço</h1>
    {actor.platformRole === "SUPER_ADMIN" ? <Link href="/admin/operators">Administrar operadores</Link> : null}
    <h2>Organizações</h2>
    {organizations.length ? <ul>{organizations.map((member) => <li key={member.organizationId}>{member.role === "DRIVER" ? <>{member.organization.name} — as suas atribuições estarão disponíveis na etapa do motorista.</> : <Link href={`/operator/${member.organizationId}`}>{member.organization.name}</Link>}</li>)}</ul> : <p>Sem organizações atribuídas. Contacte a administração.</p>}
    <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><button type="submit">Sair</button></form>
  </main>;
}
