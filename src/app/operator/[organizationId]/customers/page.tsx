import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, currentActor } from "@/modules/auth";
import { listInput, readOperatorCustomers } from "@/modules/operator";
export const dynamic = "force-dynamic";
export default async function Customers({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ search?: string; page?: string }> }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId } = await params, raw = await searchParams;
  const parsed = listInput.safeParse({ search: raw.search ?? "", page: Number(raw.page ?? 1) });
  const query = parsed.success ? parsed.data : listInput.parse({});
  const data = await readOperatorCustomers(organizationId, query).catch((error: unknown) => { if (error instanceof AccessDenied) notFound(); throw error; });
  const href = (page: number) => `?${new URLSearchParams({ search: query.search, page: String(page) })}`;
  return <main className="operator-catalog"><p className="eyebrow">Relação com o cliente</p><h1>Clientes</h1><p>Contactos registados nas reservas de teste. A mesma pessoa pode aparecer mais de uma vez; os dados de cada reserva são preservados.</p>
    {!parsed.success ? <p role="alert">Filtros inválidos. Mostramos a primeira página sem filtros.</p> : null}
    <form className="filters"><div><label htmlFor="customer-search">Pesquisar nome, e-mail ou telefone</label><input id="customer-search" name="search" defaultValue={query.search} maxLength={120} /></div><button>Pesquisar clientes</button><Link href={`/operator/${organizationId}/customers`}>Limpar pesquisa</Link></form>
    <p>{data.total} contactos encontrados.</p>
    {data.customers.length ? <ul className="resource-list">{data.customers.map((customer) => <li key={customer.id}><h2>{customer.name}</h2><p>{customer.email} · {customer.phone}</p>{customer.bookings[0] ? <p><Link href={`/operator/${organizationId}/bookings?${new URLSearchParams({ search: customer.bookings[0].id })}`}>Consultar reserva · {customer.bookings[0].serviceName}</Link></p> : <p>Sem reserva associada.</p>}</li>)}</ul> : <p className="empty-state">Nenhum contacto corresponde à pesquisa.</p>}
    <nav aria-label="Páginas de clientes">{query.page > 1 ? <Link href={href(query.page - 1)}>Anterior</Link> : null}<span>Página {query.page}</span>{data.hasNext ? <Link href={href(query.page + 1)}>Seguinte</Link> : null}</nav>
  </main>;
}
