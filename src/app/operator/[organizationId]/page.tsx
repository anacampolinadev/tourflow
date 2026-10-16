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
  return <main><Link href="/workspace">Organizações</Link><h1>{organization.name}</h1><p>O espaço operacional será disponibilizado nas próximas etapas.</p></main>;
}
