import Link from "next/link";
import { notFound } from "next/navigation";
import { readCompliance } from "@/modules/compliance";
import { CompliancePanel } from "@/components/compliance-panel";
import { requireAdminPage } from "../../../guard";
export default async function Documents({ params }: { params: Promise<{ organizationId: string }> }) {
  await requireAdminPage();
  const { organizationId } = await params;
  const data = await readCompliance(organizationId, "admin");
  if (!data) notFound();
  return <main className="narrow"><Link href={`/admin/operators/${organizationId}`}>Voltar ao operador</Link><CompliancePanel data={data} scope="admin" /></main>;
}
