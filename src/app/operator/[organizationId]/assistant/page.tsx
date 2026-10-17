import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, currentActor } from "@/modules/auth";
import { AssistantError, readAssistant } from "@/modules/assistants";
import { ResourceForm } from "@/components/resource-form";
import type { ResourceField } from "@/types/operator-core";
import { initializeAssistantAction, updateAssistantAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function AssistantPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ saved?: string; version?: string }> }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId } = await params, search = await searchParams;
  const version = search.version === undefined ? undefined : Number(search.version);
  if (version !== undefined && (!/^\d{1,3}$/.test(search.version!) || !Number.isInteger(version) || version < 1 || version > 100)) notFound();
  const data = await readAssistant(organizationId, version).catch((error: unknown) => { if (error instanceof AccessDenied || error instanceof AssistantError) notFound(); throw error; });
  const selected = data?.selected;
  const config = selected?.configuration;
  const fields: ResourceField[] = config ? [
    { name: "operatorName", label: "Nome do operador no atendimento", type: "text", value: config.operatorName, required: true, maxLength: 80 },
    { name: "assistantName", label: "Nome da assistente", type: "text", value: config.assistantName, required: true, maxLength: 60 },
    { name: "tone", label: "Tom de atendimento", type: "select", value: config.tone, options: [{ value: "WARM", label: "Acolhedor" }, { value: "FORMAL", label: "Formal" }, { value: "DIRECT", label: "Direto" }] },
    { name: "languages", label: "Idiomas de atendimento", type: "languages", value: config.languages },
    { name: "openingHours", label: "Horário de atendimento (até 1000 caracteres)", type: "textarea", value: config.openingHours, maxLength: 1000 },
    { name: "policies", label: "Políticas de atendimento (até 4000 caracteres)", type: "textarea", value: config.policies, maxLength: 4000 },
    { name: "faqs", label: "Perguntas e respostas frequentes (até 4000 caracteres)", type: "textarea", value: config.faqs, maxLength: 4000 },
    { name: "escalationName", label: "Responsável pelo atendimento humano", type: "text", value: config.escalationName, maxLength: 80 },
    { name: "escalationEmail", label: "E-mail interno para encaminhamento", type: "email", value: config.escalationEmail, maxLength: 254 },
    { name: "escalationPhone", label: "Telefone interno para encaminhamento", type: "tel", value: config.escalationPhone, maxLength: 30 },
  ] : [];
  const historical = Boolean(data && selected && data.version !== selected.version);
  return <main className="operator-catalog narrow"><Link href={`/operator/${organizationId}/settings`}>Configurações</Link><h1>Assistente Alana</h1>
    <p className="sandbox-note">Preparação em SANDBOX. Ainda sem conversas com turistas ou canais ligados. Ferramentas disponíveis apenas no painel de testes. Guardar uma versão não ativa a assistente nem publica o operador.</p>
    <p><Link href={`/operator/${organizationId}/assistant/tools`}>Abrir ferramentas de teste da Alana</Link></p>
    {search.saved === "1" ? <p role="status">Configuração da assistente guardada.</p> : null}
    {!data ? <><h2>Preparar assistente</h2><p>Cria a configuração inicial, com regras centrais da Alana e nome personalizável. Exige aprovação documental válida.</p><ResourceForm fields={[]} label="Preparar assistente de teste" action={initializeAssistantAction.bind(null, organizationId)} /></> : selected ? <>
      <h2>{historical ? "Consultar versão anterior" : "Configuração atual"} · versão {selected.version}</h2>
      <p>Os horários abaixo são de atendimento. Preços, recolhas, disponibilidade e reservas são consultados pelas ferramentas no painel de testes. As notas não alteram o catálogo nem concedem permissões operacionais.</p>
      <ResourceForm key={selected.version} fields={fields} readOnly={historical} preserveOnError label="Guardar configuração da assistente" action={updateAssistantAction.bind(null, organizationId, data.version)} />
      <p>Os contactos são internos. Ainda não há envio de mensagens nem encaminhamento automático.</p>
      <section aria-label="Regras centrais"><h2>Regras centrais da Alana</h2><ul><li>Não inventar preços, disponibilidade ou reservas.</li><li>Confirmar reserva apenas após sucesso real da ferramenta.</li><li>Respeitar a organização, os idiomas e as aprovações humanas.</li><li>Pedir ajuda humana perante falhas ou informação em falta.</li></ul><p>Estas regras são geridas pela TourFlow e não podem ser alteradas neste formulário.</p></section>
      <details><summary>Pré-visualizar instruções guardadas</summary><p>Pré-visualização da configuração, sem chamada a um modelo de IA. Os contactos internos não entram nas instruções.</p><pre className="assistant-instructions">{selected.instructions}</pre></details>
      <nav aria-label="Versões da assistente"><h2>Histórico</h2><p>Até 100 versões por operador; as versões anteriores permanecem em leitura.</p><ul>{data.history.map(item => <li key={item.version}><Link href={`/operator/${organizationId}/assistant?version=${item.version}`} aria-current={item.version === selected.version ? "page" : undefined}>Versão {item.version}{item.version === data.version ? " (atual)" : ""}</Link></li>)}</ul></nav>
    </> : null}
  </main>;
}
