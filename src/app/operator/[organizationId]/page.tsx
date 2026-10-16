import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, currentActor } from "@/modules/auth";
import { readMyOrganization } from "@/modules/tenants";

export const dynamic = "force-dynamic";

export default async function Operator({ params }: { params: Promise<{ organizationId: string }> }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId } = await params;
  const organization = await readMyOrganization(organizationId).catch((error: unknown) => {
    if (error instanceof AccessDenied) notFound();
    throw error;
  });
  if (!organization) notFound();
  return <main><Link href="/workspace">Organizações</Link><h1>{organization.name}</h1><ul><li><Link href={`/operator/${organizationId}/calendar`}>Agenda e disponibilidade</Link></li><li><Link href={`/operator/${organizationId}/services`}>Serviços</Link></li><li><Link href={`/operator/${organizationId}/vehicles`}>Veículos</Link></li><li><Link href={`/operator/${organizationId}/drivers`}>Motoristas</Link></li></ul><p><Link href={`/operator/${organizationId}/documents`}>Documentação do operador</Link> (acesso do responsável)</p><p>Reservas e distribuição serão disponibilizadas nas próximas etapas.</p></main>;
}
