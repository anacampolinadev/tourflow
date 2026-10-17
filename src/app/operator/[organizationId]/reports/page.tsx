import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { AccessDenied, currentActor } from "@/modules/auth";
import { readOperatorReport } from "@/modules/operator";
export const dynamic = "force-dynamic";
const money = (cents: bigint) => `${new Intl.NumberFormat("pt-PT").format(cents / 100n)},${String(cents % 100n).padStart(2, "0")} €`;
export default async function Reports({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ from?: string; until?: string }> }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId } = await params, query = await searchParams;
  const { data, invalid } = await readOperatorReport(organizationId, query.from || query.until ? { from: query.from, until: query.until } : undefined).then((data) => ({ data, invalid: false })).catch(async (error: unknown) => {
    if (error instanceof AccessDenied) notFound();
    if (error instanceof ZodError) return { data: await readOperatorReport(organizationId), invalid: true };
    throw error;
  });
  return <main className="operator-catalog"><p className="eyebrow">Resumo da operação</p><h1>Relatórios</h1><p>Por data de saída no fuso {data.organization.timeZone}. Até 31 dias por consulta.</p><p className="sandbox-note">Dados de teste. Valor previsto não é receita recebida. Canceladas ficam fora dos passageiros e dos valores previstos; atribuição não significa aceite ou viagem concluída.</p>
    {invalid ? <p role="alert">Período inválido. Escolha datas ordenadas, até 31 dias. Mostramos os últimos 7 dias.</p> : null}
    <form className="filters"><div><label htmlFor="report-from">De</label><input id="report-from" type="date" name="from" defaultValue={data.input.from} required /></div><div><label htmlFor="report-until">Até</label><input id="report-until" type="date" name="until" defaultValue={data.input.until} required /></div><button>Ver relatório</button></form>
    <dl className="dashboard-metrics" aria-label="Resumo do período"><div><dt>Reservas ativas</dt><dd>{data.totals.active}</dd></div><div><dt>Atribuídas em teste</dt><dd>{data.totals.assigned}</dd></div><div><dt>Canceladas</dt><dd>{data.totals.cancelled}</dd></div><div><dt>Passageiros previstos</dt><dd>{data.totals.passengers}</dd></div></dl>
    <p className="report-value"><span>Valor previsto de testes</span><strong>{money(data.totals.valueCents)}</strong></p>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Resumo diário, deslocável na horizontal"><table><caption>Saídas por dia · {data.input.from} a {data.input.until}</caption><thead><tr><th scope="col">Data</th><th scope="col">Ativas</th><th scope="col">Atribuídas</th><th scope="col">Canceladas</th><th scope="col">Passageiros</th><th scope="col">Valor previsto</th></tr></thead><tbody>{data.days.map((day) => <tr key={day.date}><th scope="row">{day.date}</th><td>{day.active}</td><td>{day.assigned}</td><td>{day.cancelled}</td><td>{day.passengers}</td><td>{money(day.valueCents)}</td></tr>)}</tbody></table></div>
  </main>;
}
