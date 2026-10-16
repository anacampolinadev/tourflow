import Link from "next/link";
import { catalogQuery } from "@/modules/tenants";
import { resourceLabels, singularLabels } from "@/types/operator-core";
import { operatorCatalogPage, resourceKind } from "./guard";
import { listResources } from "./view";
export const dynamic = "force-dynamic";
export default async function ResourceList({ params, searchParams }: { params: Promise<{ organizationId: string; resource: string }>; searchParams: Promise<{ search?: string; active?: string; page?: string }> }) {
  const { organizationId, resource } = await params;
  const kind = resourceKind(resource);
  const catalog = await operatorCatalogPage(organizationId, kind);
  const raw = await searchParams;
  const parsed = catalogQuery.safeParse({ search: raw.search ?? "", active: raw.active ?? "all", page: Number(raw.page ?? 1) });
  const query = parsed.success ? parsed.data : catalogQuery.parse({});
  const result = await listResources(organizationId, kind, query);
  const pageHref = (page: number) => `?${new URLSearchParams({ search: query.search, active: query.active, page: String(page) })}`;
  return <main className="operator-catalog"><Link href={`/operator/${organizationId}`}>Voltar ao operador</Link><div className="heading"><h1>{resourceLabels[kind]}</h1>{catalog.canManage ? <Link className="button" href={`/operator/${organizationId}/${kind}/new`}>Adicionar {singularLabels[kind]}</Link> : null}</div>
    <p>{catalog.organization.name}</p>{!catalog.writable ? <p role="alert">O cadastro está bloqueado no estado atual do operador. Pode consultar os dados existentes.</p> : null}
    {!parsed.success ? <p role="alert">Filtros inválidos. Mostramos a primeira página sem filtros.</p> : null}
    <form className="filters"><div><label htmlFor="search">Pesquisar por nome{kind === "vehicles" ? " ou matrícula" : ""}</label><input id="search" name="search" maxLength={120} defaultValue={query.search} /></div><div><label htmlFor="active">Estado do cadastro</label><select id="active" name="active" defaultValue={query.active}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">{kind === "drivers" ? "Não ativos" : "Inativos"}</option></select></div><button type="submit">Filtrar</button></form>
    <p>{result.total} {resourceLabels[kind].toLowerCase()} encontrados. Página {result.page}.</p>
    {result.items.length ? <ul className="resource-list">{result.items.map((item) => <li key={item.id}><Link href={`/operator/${organizationId}/${kind}/${item.id}`}>{item.name}</Link><p>{item.detail}</p><p>Estado: {item.status}</p></li>)}</ul> : <p>Nenhum cadastro encontrado.</p>}
    <nav aria-label="Paginação">{result.page > 1 ? <Link href={pageHref(result.page - 1)}>Página anterior</Link> : null}{result.page * 25 < result.total ? <Link href={pageHref(result.page + 1)}>Próxima página</Link> : null}</nav>
    <p>Cadastro ativo não confirma disponibilidade ou habilitação documental. Agenda e reservas serão implementadas nas próximas etapas.</p>
  </main>;
}
