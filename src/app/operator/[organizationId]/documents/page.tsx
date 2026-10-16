import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, currentActor } from "@/modules/auth";
import { readCompliance } from "@/modules/compliance";
import { CompliancePanel } from "@/components/compliance-panel";
export const dynamic = "force-dynamic";
export default async function Documents({ params }: { params: Promise<{ organizationId: string }> }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId } = await params;
  const data = await readCompliance(organizationId, "owner").catch((error: unknown) => { if (error instanceof AccessDenied) notFound(); throw error; });
  if (!data) notFound();
  return <main className="narrow"><Link href={`/operator/${organizationId}`}>Voltar ao operador</Link><CompliancePanel data={data} scope="owner" /></main>;
}
