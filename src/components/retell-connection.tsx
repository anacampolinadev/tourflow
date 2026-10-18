import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/modules/auth";
import { checkLabels, readRetellConnection } from "@/modules/integrations";
import { ResourceForm } from "./resource-form";
import { OperatorRefresh } from "./operator-navigation";
import { configureRetellAction, verifyRetellAction } from "@/app/retell-actions";
export async function RetellConnection({ organizationId, admin }: { organizationId: string; admin: boolean }) {
  const data = await readRetellConnection(organizationId, admin ? "admin" : "owner").catch((error: unknown) => { if (error instanceof AccessDenied) notFound(); throw error; }); if (!data) notFound();
  const { connection, health } = data;
  return <main className="operator-catalog narrow managed-control"><p className="eyebrow">Preparação do piloto · SANDBOX</p><h1>Ligação de telefonia</h1><p>{data.organization.name}</p>
    <div className="managed-links"><Link href={`${admin ? "/admin/operators" : "/operator"}/${organizationId}/control`}>Central de atendimento</Link><OperatorRefresh /></div>
    <section aria-label="Estado da ligação" className="managed-health"><h2>Retell</h2>
      <p>{!health.configured ? "Agente ainda não associado." : !health.credentialsReady ? "Ligação bloqueada: credencial, URL pública ou recepção não preparados no servidor." : !health.enabled ? "Recepção de eventos desativada." : health.verified ? "API e destino de eventos verificados nas últimas 24 horas." : "Verificação atual da API pendente ou sem sucesso."}</p>
      <p>Último resultado: {checkLabels[health.checkResult] ?? "Verificação pendente"}{health.checkedAt ? ` · ${health.checkedAt.toISOString()}` : ""}.</p>
      <p>{health.lastEventAt ? `Último evento autenticado recebido em ${health.lastEventAt.toISOString()}.` : "Ainda não foi recebido um evento autenticado."} {health.eventCount}/5000 eventos de piloto guardados.</p>
      {health.quotaReached ? <p role="alert">Limite de eventos atingido. A administração precisa rever a retenção antes de continuar.</p> : null}
      <p>Verificar a API ou receber eventos não prova atendimento correto. Conversas, funções de reserva, WhatsApp, validação do cliente e GO LIVE continuam pendentes.</p>
    </section>
    {admin ? <section aria-label="Configuração Retell"><h2>Preparar agente de teste</h2><p>Use um agente dedicado ao operador. O vínculo fica permanente para impedir que eventos antigos sejam atribuídos a outra empresa. Guarde primeiro e depois verifique. Não introduza chaves neste formulário.</p>
      <ResourceForm key={connection?.version ?? 0} label="Guardar ligação" preserveOnError action={configureRetellAction.bind(null, organizationId, connection?.version ?? 0)} fields={[{ name: "agentId", label: "Identificador do agente Retell", type: "text", value: connection?.agentId ?? "", required: true, maxLength: 100 }, { name: "enabled", label: "Aceitar eventos de teste após verificação", type: "checkbox", value: connection?.enabled ?? false }]} />
      {connection ? <ResourceForm fields={[]} label="Verificar ligação à API" action={verifyRetellAction.bind(null, organizationId, connection.version)} /> : null}
      <p>A verificação só consulta o agente; não cria nem publica agentes e não inicia chamadas. Uma tentativa por minuto; evidência válida até 24 horas. Mudança de configuração, chave ou URL exige nova verificação.</p>
    </section> : <p>A administração prepara e verifica esta ligação. O responsável pode acompanhar o estado e os eventos da sua organização.</p>}
    <section aria-label="Eventos recebidos"><h2>Eventos recentes</h2><p>Últimos 20 eventos de ciclo de chamada. Sem números, transcrições, gravações, análise ou identificação do turista.</p>{data.events.length ? <ul>{data.events.map(event => <li key={event.id}>{event.event === "call_started" ? "Chamada iniciada" : event.event === "call_ended" ? "Chamada terminada" : "Análise terminada no fornecedor"} · {event.receivedAt.toISOString()}</li>)}</ul> : <p>Nenhum evento recebido.</p>}</section>
  </main>;
}
