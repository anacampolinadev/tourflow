import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, currentActor } from "@/modules/auth";
import { readOperatorShell } from "@/modules/operator";
import { statusLabels } from "@/modules/tenants";
import { languageLabels } from "@/types/languages";
export const dynamic = "force-dynamic";
export default async function Settings({ params }: { params: Promise<{ organizationId: string }> }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId } = await params;
  const { organization, context } = await readOperatorShell(organizationId).catch((error: unknown) => { if (error instanceof AccessDenied) notFound(); throw error; });
  const language = Object.entries(languageLabels).find(([key]) => key === organization.operator?.primaryLanguage)?.[1] ?? organization.operator?.primaryLanguage ?? "Não definido";
  return <main className="operator-catalog"><p className="eyebrow">Dados da organização</p><h1>Configurações</h1><dl className="settings-details"><div><dt>Operador</dt><dd>{organization.name}</dd></div><div><dt>Estado</dt><dd>{organization.operator ? statusLabels[organization.operator.status] : "Sem perfil operacional"}</dd></div><div><dt>Fuso horário</dt><dd>{organization.timeZone}</dd></div><div><dt>Idioma principal</dt><dd>{language}</dd></div></dl>
    <section><h2>Marca</h2><p>Identidade visual do painel e do portal do motorista.</p><Link href={`/operator/${organizationId}/brand`}>Consultar identidade da marca</Link></section>
    {context.role === "OPERATOR_OWNER" ? <section><h2>Assistente</h2><p>Nome, idiomas, políticas e versões de teste da Alana.</p><Link href={`/operator/${organizationId}/assistant`}>Configurar assistente Alana</Link></section> : null}
    <h2>Agenda e recursos</h2><p>O fuso, as saídas, as janelas e os bloqueios são geridos na agenda. Compromissos futuros podem impedir alterações.</p><Link href={`/operator/${organizationId}/calendar`}>{context.role === "OPERATOR_OWNER" ? "Configurar agenda" : "Consultar agenda"}</Link>
    {context.role === "OPERATOR_OWNER" ? <section><h2>Documentação</h2><p>A aprovação documental é feita pela administração. A aprovação não publica o operador.</p><Link href={`/operator/${organizationId}/documents`}>Abrir documentação do operador</Link></section> : <p>Peça ao responsável as alterações de documentação e dados do operador.</p>}
    <p className="sandbox-note">As reservas e atribuições disponíveis são de teste interno. A entrada em produção depende das validações futuras.</p>
  </main>;
}
