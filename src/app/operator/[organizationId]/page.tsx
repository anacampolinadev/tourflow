import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { AccessDenied, currentActor } from "@/modules/auth";
import { readOperatorDashboard } from "@/modules/operator";
import { statusLabels } from "@/modules/tenants";
import { bookingLabels } from "@/modules/bookings";
import { localLabel } from "@/modules/availability";
import { OperatorRefresh } from "@/components/operator-navigation";
export const dynamic = "force-dynamic";
export default async function Operator({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ date?: string; page?: string }> }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId } = await params, query = await searchParams;
  const { data, invalid } = await readOperatorDashboard(organizationId, { ...(query.date ? { date: query.date } : {}), page: Number(query.page ?? 1) }).then((data) => ({ data, invalid: false })).catch(async (error: unknown) => {
    if (error instanceof AccessDenied) notFound();
    if (error instanceof ZodError) return { data: await readOperatorDashboard(organizationId), invalid: true };
    throw error;
  });
  const base = `/operator/${organizationId}`, owner = data.context.role === "OPERATOR_OWNER", canManage = owner || data.context.role === "OPERATOR_DISPATCHER";
  const listHref = `${base}/bookings?date=${data.date}`;
  const dayLabel = new Intl.DateTimeFormat("pt-PT", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${data.date}T12:00Z`));
  return <main className="dashboard"><div className="dashboard-heading"><div><p className="eyebrow">Visão do operador</p><h1>{data.organization.name}</h1><p>{data.organization.operator ? statusLabels[data.organization.operator.status] : "Sem perfil operacional"} · {data.organization.timeZone}</p></div><div className="dashboard-tools"><Link href={base}>Hoje</Link><OperatorRefresh />{canManage && data.canCreateTestBooking ? <Link className="button" href={`${base}/bookings?new=1`}>Nova reserva de teste</Link> : null}</div></div>
    <p className="sandbox-note">Ambiente de teste interno. Reservas e atribuições não representam vendas ou viagens realizadas.</p>
    {invalid ? <p role="alert">Filtros inválidos. Mostramos o dia atual.</p> : null}
    <div className="dashboard-day"><h2>{dayLabel}</h2><form className="filters"><div><label htmlFor="dashboard-date">Dia da operação</label><input id="dashboard-date" name="date" type="date" defaultValue={data.date} required /></div><button>Ver dia</button></form></div>
    <dl className="dashboard-metrics" aria-label="Resumo do dia">
      <div><dt>Reservas ativas</dt><dd>{data.stats.total}</dd><span>Canceladas excluídas</span></div><div><dt>Aguardam atribuição</dt><dd>{data.stats.confirmed}</dd><Link href={`${listHref}&status=PENDING_ASSIGNMENT`}>Consultar reservas</Link></div><div><dt>Atribuídas em teste</dt><dd>{data.stats.assigned}</dd><Link href={`${listHref}&status=ASSIGNED_GROUP`}>Ver atribuições</Link></div><div><dt>Motoristas com janela</dt><dd>{data.stats.driversWithWindows}</dd><span>Janela neste dia; consultar elegibilidade</span></div>
    </dl>
    <section className="dashboard-attention" aria-labelledby="attention-title"><div className="section-heading"><h2 id="attention-title">Ações necessárias</h2><span className="status-chip">{canManage ? "Gestão" : "Consulta"}</span></div>
      {!canManage ? <p>Modo de leitura. As alterações são feitas pelo responsável ou gestor de operações.</p> : null}
      <ul className="attention-list">
        {!data.canCreateTestBooking ? <li><strong>Novas reservas de teste bloqueadas</strong><p>Verifique o estado e a aprovação documental do operador.</p>{owner ? <Link href={`${base}/documents`}>Rever documentação</Link> : <p>Peça a revisão ao responsável.</p>}</li> : null}
        {data.attentionDocuments ? <li><strong>{data.attentionDocuments} {data.attentionDocuments === 1 ? "requisito documental precisa de revisão" : "requisitos documentais precisam de revisão"}</strong>{owner ? <p><Link href={`${base}/documents`}>Abrir documentação</Link></p> : <p>O responsável pode consultar os documentos.</p>}</li> : null}
        {data.nearExpiry ? <li><strong>{data.nearExpiry} {data.nearExpiry === 1 ? "documento expira" : "documentos expiram"} nos próximos 7 dias</strong>{owner ? <p><Link href={`${base}/documents`}>Preparar atualização</Link></p> : <p>Avise o responsável.</p>}</li> : null}
        {data.stats.confirmed ? <li><strong>{data.stats.confirmed} {data.stats.confirmed === 1 ? "reserva aguarda" : "reservas aguardam"} atribuição neste dia</strong><p><Link href={`${listHref}&status=PENDING_ASSIGNMENT`}>{canManage ? "Abrir reservas para distribuir" : "Consultar pendências"}</Link></p></li> : null}
        {data.problemCount ? <li><strong>{data.problemCount} {data.problemCount === 1 ? "reserva precisa de redistribuição" : "reservas precisam de redistribuição"}</strong><p>A ocupação anterior foi preservada. Consulte o motivo antes de tentar novamente.</p><ul>{data.problems.map((problem) => <li key={problem.id}><Link href={`${base}/dispatch/${problem.id}`}>{problem.serviceName}</Link><p>{problem.reason}</p></li>)}</ul>{data.problemCount > data.problems.length ? <p>Mostramos as primeiras 10 ocorrências.</p> : null}</li> : null}
        {!data.resources.services || !data.resources.vehicles || !data.resources.drivers ? <li><strong>Complete os cadastros para preparar a operação de teste</strong><p>{data.resources.services} serviços ativos · {data.resources.vehicles} veículos ativos · {data.resources.drivers} motoristas ativos.</p><Link href={`${base}/services`}>Consultar cadastros</Link></li> : null}
      </ul>
      {data.canCreateTestBooking && !data.attentionDocuments && !data.nearExpiry && !data.stats.confirmed && !data.problemCount && data.resources.services > 0 && data.resources.vehicles > 0 && data.resources.drivers > 0 ? <p className="empty-state">Nenhuma pendência identificada nesta visão. A elegibilidade é revalidada ao reservar ou distribuir.</p> : null}
    </section>
    <section className="dashboard-next"><p className="eyebrow">Próxima saída neste dia</p>{data.next ? <><h2>{data.next.serviceName}</h2><p><strong>{localLabel(data.next.startsAt, data.organization.timeZone).slice(11)}</strong> · {data.next.passengers} passageiros · {bookingLabels[data.next.status]}</p><Link href={`${base}/dispatch/${data.next.id}`}>Consultar distribuição</Link></> : <><h2>Sem saída futura neste dia</h2><p>Consulte as reservas ou escolha outra data.</p></>}</section>
    <section><div className="section-heading"><h2>Reservas do dia</h2><Link href={listHref}>Ver na lista de reservas</Link></div>{data.bookings.length ? <ul className="dashboard-bookings">{data.bookings.map((booking) => <li key={booking.id}><div className="booking-time">{localLabel(booking.startsAt, data.organization.timeZone).slice(11)}</div><div><h3>{booking.serviceName}</h3><p>{booking.customer.name} · {booking.passengers} passageiros</p>{!["CONFIRMED", "DRIVER_DECLINED", "CANCELLED"].includes(booking.status) && booking.occupancy ? <p>{booking.occupancy.driver.name} · {booking.occupancy.vehicle.name}</p> : null}</div><div><span className={`status-chip ${booking.status.toLowerCase()}`}>{bookingLabels[booking.status]}</span><p><Link href={`${base}/dispatch/${booking.id}`}>Ver distribuição</Link></p></div></li>)}</ul> : <p className="empty-state">Não há reservas neste dia.</p>}
      <nav aria-label="Páginas do dia">{data.page > 1 ? <Link href={`?date=${data.date}&page=${data.page - 1}`}>Anterior</Link> : null}<span>Página {data.page}</span>{data.hasNext ? <Link href={`?date=${data.date}&page=${data.page + 1}`}>Seguinte</Link> : null}</nav>
      <p>{data.stats.cancelled} {data.stats.cancelled === 1 ? "cancelada" : "canceladas"} neste dia. Atualizado às {localLabel(data.checkedAt, data.organization.timeZone).slice(11)}.</p>
    </section>
    <div className="dashboard-links"><Link href={`${base}/calendar?date=${data.date}`}>Agenda e disponibilidade</Link><Link href={`${base}/reports`}>Consultar resumo por período</Link></div>
  </main>;
}
