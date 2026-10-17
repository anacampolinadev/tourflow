import Link from "next/link";
import { notFound } from "next/navigation";
import { readOperatorQa, QaError } from "@/modules/qa";
import { QaReport } from "@/components/qa-report";
import { requireAdminPage } from "../../../guard";
export const dynamic = "force-dynamic";
export default async function AdminQaPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ run?: string; view?: string }> }) {
  await requireAdminPage();
  const { organizationId } = await params, search = await searchParams;
  const data = await readOperatorQa(organizationId, "admin", search.run).catch((error: unknown) => { if (error instanceof QaError) notFound(); throw error; });
  if (!data) notFound();
  return <main className="narrow"><Link href={`/admin/operators/${organizationId}`}>Voltar ao operador</Link><h1>Revisão de qualidade</h1><p>{data.organization.name}</p><QaReport data={data} organizationId={organizationId} admin showAll={search.view === "all"} /></main>;
}
