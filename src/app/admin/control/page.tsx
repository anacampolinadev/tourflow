import Link from "next/link";
import { notFound } from "next/navigation";
import { ZodError } from "zod";
import { readManagedCentral } from "@/modules/managed-ops";
import { ManagedHealth } from "@/components/managed-operations";
import { OperatorRefresh } from "@/components/operator-navigation";
export const dynamic = "force-dynamic";
export default async function ManagedCentralPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const data = await readManagedCentral((await searchParams).page).catch((error: unknown) => { if (error instanceof ZodError) notFound(); throw error; });
  return <main className="operator-catalog narrow managed-control"><p className="eyebrow">TourFlow Control · SANDBOX</p><h1>Central Managed</h1><p>Exceções por operador. Dados privados; acesso administrativo auditado.</p><OperatorRefresh />
    <p>{data.total} operador(es) · página {data.page} · até 20 por página. As contagens de cada cartão abrangem todo o operador.</p>
    {data.items.map(item => <article className="managed-card" key={item.id}><h2>{item.name}</h2><Link href={`/admin/operators/${item.id}/control`}>Abrir atendimento deste operador</Link><ManagedHealth health={item.health} base={`/admin/operators/${item.id}`} /></article>)}
    {data.total === 0 ? <p>Nenhum operador cadastrado.</p> : null}
    <nav className="managed-links" aria-label="Páginas de operadores">{data.page > 1 ? <Link href={`/admin/control?page=${data.page - 1}`}>Página anterior</Link> : null}{data.page * 20 < data.total ? <Link href={`/admin/control?page=${data.page + 1}`}>Página seguinte</Link> : null}</nav>
  </main>;
}
