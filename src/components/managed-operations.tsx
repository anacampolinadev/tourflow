import Link from "next/link";
import { notFound } from "next/navigation";
import { ZodError } from "zod";
import { AccessDenied } from "@/modules/auth";
import { handoffStatuses, handoffLabels, readManagedOperations, type ManagedScope } from "@/modules/managed-ops";
import { ResourceForm } from "./resource-form";
import { OperatorRefresh } from "./operator-navigation";
import { handoffAction } from "@/app/managed-actions";
type Health = NonNullable<Awaited<ReturnType<typeof readManagedOperations>>>["health"];
export function ManagedHealth({ health, base }: { health: Health; base: string }) {
  return <section className="managed-health" aria-label="Saúde da operação"><h2>Precisa de mim</h2>
    <p>Verificado em {health.checkedAt.toISOString()} · dados de teste SANDBOX.</p>
    <ul>
      {health.open > 0 ? <li><strong>{health.open} pedido(s) por assumir.</strong> Abra a fila abaixo.</li> : null}
      {health.active > 0 ? <li>{health.active} atendimento(s) em curso. Acompanhe a fila Em atendimento.</li> : null}
      {!health.operatorStatus || ["RESTRICTED", "SUSPENDED"].includes(health.operatorStatus) ? <li>Operação bloqueada pelo estado do operador.</li> : null}
      {health.approvalMissing ? <li><Link href={`${base}/documents`}>Aprovação documental pendente</Link>.</li> : null}
      {health.noRequirements ? <li><Link href={`${base}/documents`}>Checklist documental ainda não preparado</Link>.</li> : null}
      {health.documents.map(document => <li key={document.id}><Link href={`${base}/documents`}>{document.title}</Link>: {document.state === "EXPIRING" ? "validade termina nos próximos 7 dias" : "documento em falta, sem aprovação ou expirado"}.</li>)}
      {health.declined > 0 ? <li>{health.declined} reserva(s) futura(s) com recusa do motorista. {base.startsWith("/operator/") ? <Link href={`${base}/bookings`}>Rever atribuição</Link> : "Peça ao operador para rever a atribuição."}</li> : null}
      {health.unassigned > 0 ? <li>{health.unassigned} reserva(s) sem distribuição nas próximas 24 horas. {base.startsWith("/operator/") ? <Link href={`${base}/bookings`}>Abrir reservas</Link> : "Peça ao operador para distribuir."}</li> : null}
      {health.overdue > 0 ? <li>{health.overdue} reserva(s) com início ou conclusão em atraso. {base.startsWith("/operator/") ? <Link href={`${base}/bookings`}>Rever execução</Link> : "Peça ao operador para rever a execução."}</li> : null}
      {health.retell.configured ? <li>Telefonia Retell: {!health.retell.enabled ? "recepção desativada" : health.retell.verified ? "API verificada; atendimento ainda pendente" : "verificação atual da ligação pendente"}. {health.retell.quotaReached ? "Limite de eventos atingido." : ""} WhatsApp e n8n ainda não integrados.</li> : <li>Atendimento externo pendente: Retell, WhatsApp e n8n ainda não integrados. Não há conectividade verificada.</li>}
    </ul>
    <p>Produção bloqueada. Esta central não substitui o QA, a validação do cliente ou o GO LIVE.</p>
    <Link href={`${base}/integrations`}>Ligação de telefonia</Link>
  </section>;
}
const eventLabels: Record<string, string> = { CLAIM: "Atendimento assumido", RELEASE: "Devolvido à fila", RESOLVE: "Resolução registada", REOPEN: "Atendimento reaberto" };
export async function ManagedOperations({ organizationId, scope, search }: { organizationId: string; scope: ManagedScope; search: { status?: string; page?: string } }) {
  const data = await readManagedOperations(organizationId, scope, { status: search.status, page: search.page }).catch((error: unknown) => { if (error instanceof AccessDenied || error instanceof ZodError) notFound(); throw error; });
  if (!data) notFound();
  const base = scope === "admin" ? `/admin/operators/${organizationId}` : `/operator/${organizationId}`, path = `${base}/control`;
  return <main className="operator-catalog narrow managed-control"><p className="eyebrow">TourFlow Managed · SANDBOX</p><h1>Central de atendimento</h1><p>{data.organization.name}</p>
    <div className="managed-links"><OperatorRefresh /><Link href={`${base}/qa`}>Qualidade</Link>{scope === "admin" ? <Link href="/admin/control">Todos os operadores</Link> : <Link href={`${base}/assistant/tools`}>Ferramentas da assistente</Link>}</div>
    <ManagedHealth health={data.health} base={base} />
    <section aria-label="Fila de atendimento"><h2>Atendimentos internos</h2><p>Pedidos manuais de teste. Assumir ou concluir regista a ação na central; nenhuma mensagem é enviada ao turista.</p>
      <nav className="managed-links" aria-label="Estado do atendimento">{handoffStatuses.map(status => <Link key={status} href={`${path}?status=${status}`} aria-current={data.status === status ? "page" : undefined}>{handoffLabels[status]}</Link>)}</nav>
      <p>{data.total} atendimento(s) · página {data.page}</p>
      {data.items.length === 0 ? <p className="empty-state">Nenhum atendimento neste estado.</p> : null}
      {data.items.map(item => <article key={`${item.id}-${item.version}`} className="managed-card" aria-label={`Atendimento ${item.id}`}>
        <h3>Pedido de ajuda humana</h3><p className="status-chip">{item.status === "OPEN" ? "Por assumir" : item.status === "RESOLVED" ? "Concluído" : item.assignedToMe ? "Em atendimento por si" : "Em atendimento por outra pessoa"}</p>
        <p className="managed-note">{item.reason}</p><p>Criado em {item.createdAt.toISOString()} · revisão {item.version}</p>
        {item.resolvedAt ? <p>Concluído em {item.resolvedAt.toISOString()}</p> : null}
        {item.version < 100 ? <div className="managed-actions">
          {item.status === "OPEN" ? <ResourceForm fields={[]} label="Assumir atendimento" action={handoffAction.bind(null, organizationId, item.id, scope, item.version, "CLAIM")} /> : null}
          {item.status === "IN_PROGRESS" && item.assignedToMe ? <ResourceForm fields={[{ name: "note", label: "Resolução (10–1000 caracteres, sem dados de turistas)", type: "textarea", value: "", required: true, maxLength: 1000 }]} preserveOnError label="Concluir atendimento" action={handoffAction.bind(null, organizationId, item.id, scope, item.version, "RESOLVE")} /> : null}
          {item.status === "IN_PROGRESS" && (item.assignedToMe || data.admin) ? <ResourceForm fields={[]} label="Devolver à fila" action={handoffAction.bind(null, organizationId, item.id, scope, item.version, "RELEASE")} /> : null}
          {item.status === "RESOLVED" ? <ResourceForm fields={[]} label="Reabrir atendimento" action={handoffAction.bind(null, organizationId, item.id, scope, item.version, "REOPEN")} /> : null}
        </div> : <p>Limite de alterações atingido. Contacte a administração.</p>}
        <details><summary>Histórico ({item.events.length})</summary><ol>{item.events.map(event => <li key={event.id}>{eventLabels[event.action]} · revisão {event.version} · {event.createdAt.toISOString()}{event.note ? <p className="managed-note">{event.note}</p> : null}</li>)}</ol></details>
      </article>)}
      <nav className="managed-links" aria-label="Páginas de atendimento">{data.page > 1 ? <Link href={`${path}?status=${data.status}&page=${data.page - 1}`}>Página anterior</Link> : null}{data.page * 20 < data.total ? <Link href={`${path}?status=${data.status}&page=${data.page + 1}`}>Página seguinte</Link> : null}</nav>
    </section>
  </main>;
}
