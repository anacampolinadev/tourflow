import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, currentActor, currentTenant } from "@/modules/auth";
import { readPageBrand, BrandMark } from "@/components/brand-identity";
import { ResourceForm } from "@/components/resource-form";
import { BrandForm } from "@/components/brand-form";
import { generateBrandAction, updateBrandAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function BrandPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ saved?: string }> }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId } = await params;
  const [context, brand] = await Promise.all([currentTenant(organizationId), readPageBrand(organizationId)]).catch((error: unknown) => { if (error instanceof AccessDenied) notFound(); throw error; });
  const owner = context.role === "OPERATOR_OWNER";
  return <main className="operator-catalog narrow"><Link href={`/operator/${organizationId}/settings`}>Configurações</Link><h1>Identidade da marca</h1>
    <p className="sandbox-note">Configuração de teste interno. Gerar a marca não publica o operador nem altera os gates de aprovação.</p>
    {(await searchParams).saved === "1" ? <p role="status">Identidade guardada.</p> : null}
    {!brand.generated ? <><h2>Gerar ambiente de marca</h2><p>A geração cria uma configuração para este operador e os ícones da sua aplicação, sem duplicar utilizadores, serviços ou recursos. Exige aprovação documental válida.</p>{owner ? <ResourceForm fields={[]} label="Gerar white-label de teste" action={generateBrandAction.bind(null, organizationId)} /> : <p>O responsável pode gerar a identidade após a aprovação.</p>}</> : <>
      <section className="brand-preview" aria-label="Identidade atual"><BrandMark organizationId={organizationId} brand={brand} /><p>Cor principal: {brand.primaryColor} · Cor secundária: {brand.secondaryColor}</p><p>Versão {brand.version}</p></section>
      {owner && brand.version !== null ? <BrandForm key={brand.version} initial={{ displayName: brand.displayName, primaryColor: brand.primaryColor, secondaryColor: brand.secondaryColor }} action={updateBrandAction.bind(null, organizationId, brand.version)} /> : <p>Modo de leitura. Apenas o responsável altera a identidade.</p>}
      <p>A marca é aplicada ao painel e ao portal do motorista. A aplicação instalada pode precisar de atualização pelo navegador para refletir novos nome e ícones.</p>
    </>}
    <p>Logos e ícones são privados. Domínios próprios, comunicações da assistente e produção ficam para etapas posteriores.</p>
  </main>;
}
