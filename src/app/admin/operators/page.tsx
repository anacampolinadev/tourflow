import Link from "next/link";
import { listOperators, operatorStatuses, statusLabels } from "@/modules/tenants";

export default async function Operators({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const query = await searchParams;
  const status = operatorStatuses.find((item) => item === query.status);
  const { organizations, total, page } = await listOperators({ search: query.q, status, page: Number(query.page ?? 1) });
  const pageLink = (next: number) => `/admin/operators?${new URLSearchParams({ q: query.q ?? "", status: status ?? "", page: String(next) })}`;
  return <main>
    <div className="heading"><h1>Operadores</h1><Link className="button" href="/admin/operators/new">Novo operador</Link></div>
    <form method="get" className="filters">
      <div><label htmlFor="q">Nome do operador</label><input id="q" name="q" defaultValue={query.q} maxLength={120} /></div>
      <div><label htmlFor="status">Estado</label><select id="status" name="status" defaultValue={status ?? ""}><option value="">Todos</option>{operatorStatuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></div>
      <button type="submit">Filtrar</button>
    </form>
    <p>{total} operadores encontrados</p>
    {organizations.length ? <div className="table-scroll"><table><thead><tr><th>Operador</th><th>Responsável</th><th>Plano</th><th>Estado</th></tr></thead><tbody>
      {organizations.map((organization) => <tr key={organization.id}><td><Link href={`/admin/operators/${organization.id}`}>{organization.name}</Link></td><td>{organization.operator?.responsibleName}</td><td>{organization.operator?.plan}</td><td>{organization.operator ? statusLabels[organization.operator.status] : "—"}</td></tr>)}
    </tbody></table></div> : <p>Nenhum operador corresponde aos filtros. Cadastre o primeiro operador para começar.</p>}
    <nav aria-label="Paginação">{page > 1 ? <Link href={pageLink(page - 1)}>Anterior</Link> : null}<span>Página {page}</span>{page * 25 < total ? <Link href={pageLink(page + 1)}>Seguinte</Link> : null}</nav>
  </main>;
}
