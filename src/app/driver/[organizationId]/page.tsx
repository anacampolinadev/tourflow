import type { Metadata, Viewport } from "next";
import { BrandMark, brandStyle, readPageBrand } from "@/components/brand-identity";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, currentActor, signOut } from "@/modules/auth";
import { readDriverPortal, driverCommandLabels, type DriverCommandType } from "@/modules/drivers";
import { bookingLabels } from "@/modules/bookings";
import { localLabel } from "@/modules/availability";
import { ResourceForm } from "@/components/resource-form";
import { DriverConnectivity } from "@/components/driver-connectivity";
import { driverAction } from "./actions";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ organizationId: string }> }): Promise<Metadata> {
  const { organizationId } = await params;
  try { const brand = await readPageBrand(organizationId); return { title: brand.generated ? `Motorista · ${brand.displayName}` : "Motorista · TourFlow", appleWebApp: { capable: true, title: brand.generated ? brand.displayName : "TourFlow" }, ...(brand.generated ? { icons: { apple: `/api/organizations/${organizationId}/brand/icon192?v=${brand.version}` } } : {}) }; }
  catch (error) { if (error instanceof AccessDenied) return { title: "Motorista · TourFlow" }; throw error; }
}
export async function generateViewport({ params }: { params: Promise<{ organizationId: string }> }): Promise<Viewport> {
  try { const brand = await readPageBrand((await params).organizationId); return { themeColor: brand.generated ? brand.primaryColor : "#143f38" }; }
  catch (error) { if (error instanceof AccessDenied) return {}; throw error; }
}
export default async function DriverPortal({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ page?: string; saved?: string; history?: string }> }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId } = await params, query = await searchParams;
  const page = Number(query.page ?? "1");
  if (!Number.isInteger(page) || page < 1 || page > 10000) notFound();
  const history = query.history === "1";
  const data = await readDriverPortal(organizationId, page, history).catch((error: unknown) => { if (error instanceof AccessDenied) notFound(); throw error; });
  const brand = await readPageBrand(organizationId);
  return <><link rel="manifest" href={`/driver/${organizationId}/manifest.webmanifest`} crossOrigin="use-credentials" /><div className={brand.generated ? "brand-themed" : undefined} style={brandStyle(brand)}><main><header><Link href="/workspace">O seu espaço</Link><div className="driver-brand"><BrandMark organizationId={organizationId} brand={brand} /><span>Motorista</span></div><h1>Olá, {data.driver.name}</h1><p>{data.organization.name} · {data.organization.timeZone}</p></header>
    <aside role="note"><strong>Teste interno</strong><p>Aceite e execução simulados. Sem autorização para operação pública.</p></aside>
    <DriverConnectivity />
    {query.saved === "1" ? <p role="status">Etapa guardada no servidor.</p> : null}
    <nav aria-label="Serviços do motorista"><Link href={`/driver/${organizationId}`} aria-current={!history ? "page" : undefined}>Por realizar</Link><Link href={`/driver/${organizationId}?history=1`} aria-current={history ? "page" : undefined}>Concluídos</Link></nav>
    <h2>{history ? "Histórico de teste" : "Os seus serviços"}</h2>
    {!data.bookings.length ? <p>{history ? "Ainda não concluiu serviços." : "Sem serviços atribuídos. As janelas de trabalho são geridas pelo operador; esta lista não indica disponibilidade para novos pedidos."}</p> : null}
    {data.bookings.map((booking) => {
      const commands: DriverCommandType[] = booking.status === "ASSIGNED" ? ["ACCEPT", "DECLINE"] : booking.status === "DRIVER_ACCEPTED" ? ["ARRIVE"] : booking.status === "ARRIVED" ? ["START"] : booking.status === "IN_PROGRESS" ? ["COMPLETE"] : [];
      const destination = booking.pickup || booking.meetingPoint;
      return <article className="driver-card" key={`${booking.id}-${booking.version}`} aria-label={`Serviço ${booking.serviceName}`}><p className="driver-eyebrow">{bookingLabels[booking.status]}</p><h3>{booking.serviceName}</h3>
        <p><strong>{localLabel(booking.startsAt, booking.timeZone).replace("T", " ")}</strong><br />Até {localLabel(booking.endsAt, booking.timeZone).replace("T", " ")}</p>
        <dl><dt>Grupo</dt><dd>{booking.passengers} passageiros · {booking.language ?? "sem idioma pedido"}</dd><dt>Cliente</dt><dd>{booking.customer.name} · <a href={`tel:${booking.customer.phone.replace(/[^+\d]/g, "")}`}>{booking.customer.phone}</a></dd><dt>Veículo</dt><dd>{booking.occupancy?.vehicle.name} · {booking.occupancy?.vehicle.registration}</dd><dt>Encontro</dt><dd>{destination}</dd></dl>
        {booking.pickup ? <p>{booking.pickupRules}</p> : null}
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`} target="_blank" rel="noopener noreferrer">Abrir rota no mapa</a>
        <div className="driver-actions">{commands.map((type) => type === "DECLINE" ? <details key={type}><summary>Recusar serviço</summary><p>O operador terá de redistribuir. A recusa não cancela a reserva.</p><ResourceForm fields={[]} label="Confirmar recusa" action={driverAction.bind(null, organizationId, booking.id, booking.version, type, randomUUID())} /></details> : <ResourceForm key={type} fields={[]} label={driverCommandLabels[type]} action={driverAction.bind(null, organizationId, booking.id, booking.version, type, randomUUID())} />)}</div>
      </article>;
    })}
    <nav aria-label="Páginas de serviços">{page > 1 ? <Link href={`?page=${page - 1}&history=${history ? 1 : 0}`}>Anterior</Link> : null}<span>Página {page}</span>{data.hasNext ? <Link href={`?page=${page + 1}&history=${history ? 1 : 0}`}>Seguinte</Link> : null}</nav>
    <details><summary>Adicionar ao ecrã inicial</summary><p>No Chrome/Edge, use o menu para instalar a aplicação. No Safari do iPhone, use Partilhar → Adicionar ao ecrã principal. A instalação requer HTTPS (ou localhost para testes). É necessária ligação para consultar e guardar etapas; não existem notificações automáticas nesta versão.</p></details>
    <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><button>Sair</button></form>
  </main></div></>;
}
