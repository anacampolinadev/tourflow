import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, currentActor } from "@/modules/auth";
import { QaError, readOperatorQa } from "@/modules/qa";
import { QaReport } from "@/components/qa-report";
import { ResourceForm } from "@/components/resource-form";
import { runQaAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function QaPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ run?: string; view?: string }> }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId } = await params, search = await searchParams;
  const data = await readOperatorQa(organizationId, "owner", search.run).catch((error: unknown) => { if (error instanceof AccessDenied || error instanceof QaError) notFound(); throw error; });
  if (!data) notFound();
  return <main className="operator-catalog narrow"><Link href={`/operator/${organizationId}/assistant`}>Assistente Alana</Link><h1>Qualidade do operador</h1>
    <p>Execute a bateria de teste após preparar marca, serviços, recursos, agenda e assistente. O primeiro relatório coloca o operador em testes; não altera a aprovação documental nem publica.</p>
    {data.canRun ? <ResourceForm fields={[]} label="Executar bateria de QA" action={runQaAction.bind(null, organizationId)} /> : <p role="alert">A bateria exige documentação aprovada e estado aprovado ou em testes.</p>}
    <QaReport data={data} organizationId={organizationId} admin={false} showAll={search.view === "all"} />
  </main>;
}
