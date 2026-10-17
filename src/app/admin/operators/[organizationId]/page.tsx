import Link from "next/link";
import { notFound } from "next/navigation";
import { OperatorForm } from "@/components/operator-form";
import { StatusForm } from "@/components/status-form";
import { getOperator, allowedNextStatuses, statusLabels } from "@/modules/tenants";
import { saveOperator, saveStatus } from "../actions";
import { requireAdminPage } from "../../guard";

export default async function OperatorDetail({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireAdminPage();
  const { organizationId } = await params;
  const organization = await getOperator(organizationId);
  if (!organization?.operator) notFound();
  const profile = organization.operator;
  const options = allowedNextStatuses(profile.status).map((value) => ({ value, label: statusLabels[value] }));
  return <main className="narrow"><Link href="/admin/operators">Voltar aos operadores</Link><h1>{organization.name}</h1>
    {(await searchParams).saved ? <p role="status">Alterações guardadas.</p> : null}
    <p>Estado: <strong>{statusLabels[profile.status]}</strong></p>
    <p>Endereço: {organization.slug}</p>
    <OperatorForm action={saveOperator.bind(null, organizationId, profile.version)} values={{ name: organization.name, ...profile }} />
    <h2>Estado do operador</h2>
    {options.length ? <StatusForm action={saveStatus.bind(null, organizationId, profile.version)} options={options} /> : <p>Não há transições disponíveis nesta etapa.</p>}
    <p><Link href={`/admin/operators/${organizationId}/documents`}>Rever documentação</Link></p>
    <p><Link href={`/admin/operators/${organizationId}/qa`}>Rever qualidade do operador</Link></p>
    <p>Produção depende das validações de qualidade, do cliente e do GO LIVE.</p>
  </main>;
}
