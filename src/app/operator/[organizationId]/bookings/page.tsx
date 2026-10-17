import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, currentActor } from "@/modules/auth";
import { readBookings, bookingLabels } from "@/modules/bookings";
import { localLabel } from "@/modules/availability";
import { ResourceForm } from "@/components/resource-form";
import { bookingAction, cancelAction } from "./actions";
export const dynamic = "force-dynamic";
const money = (amount: number, currency: string) => new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(amount / 100);

export default async function Bookings({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ page?: string; saved?: string }> }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId } = await params, query = await searchParams;
  const page = Number(query.page ?? "1");
  if (!Number.isInteger(page) || page < 1 || page > 10000) notFound();
  const data = await readBookings(organizationId, page).catch((error: unknown) => { if (error instanceof AccessDenied) notFound(); throw error; });
  const canManage = ["OPERATOR_OWNER", "OPERATOR_DISPATCHER"].includes(data.context.role);
  return <main className="operator-catalog"><Link href={`/operator/${organizationId}`}>Operador</Link>
    <h1>Reservas</h1><p>{data.organization.name} · {data.organization.timeZone}</p>
    <p role="note">Ambiente de teste interno. Estas reservas ocupam a agenda de teste; não representam vendas nem autorizam operação pública. É necessária aprovação documental válida. Cada reserva ocupa um veículo e um motorista para todo o grupo. A atribuição de recursos é gerida na distribuição interna.</p>
    {query.saved === "1" ? <p role="status">Reserva guardada.</p> : null}
    {canManage ? <details><summary>Nova reserva de teste</summary><p>O preço é calculado pelo serviço ao confirmar. Sem cobrança.</p>
      <ResourceForm preserveOnError label="Confirmar reserva de teste" action={bookingAction.bind(null, organizationId, randomUUID())} fields={[
        { name: "serviceId", label: "Serviço", type: "select", value: "", options: [{ value: "", label: "Selecione um serviço" }, ...data.organization.services.map((service) => ({ value: service.id, label: `${service.name} · ${money(service.basePriceCents, service.currency)} ${service.pricingType === "PER_PERSON" ? "por pessoa" : "por grupo"}` }))] },
        { name: "date", label: "Data", type: "date", value: "", required: true },
        { name: "time", label: "Hora de saída", type: "time", value: "", required: true },
        { name: "passengers", label: "Passageiros", type: "number", value: "1", min: 1, max: 100, required: true },
        { name: "language", label: "Idioma pedido", type: "select", value: "", options: [{ value: "", label: "Sem preferência" }, { value: "pt", label: "Português" }, { value: "en", label: "Inglês" }, { value: "es", label: "Espanhol" }, { value: "de", label: "Alemão" }] },
        { name: "customerName", label: "Nome do cliente", type: "text", value: "", required: true, maxLength: 120 },
        { name: "customerEmail", label: "E-mail do cliente", type: "email", value: "", required: true, maxLength: 254 },
        { name: "customerPhone", label: "Telefone do cliente", type: "tel", value: "", required: true, maxLength: 30 },
        { name: "pickup", label: "Local de recolha (opcional)", type: "text", value: "", maxLength: 300 },
        { name: "notes", label: "Observações privadas (opcional)", type: "textarea", value: "", maxLength: 1000 },
        { name: "source", label: "Origem", type: "select", value: "OPERATOR", options: [{ value: "OPERATOR", label: "Operador" }, { value: "PHONE", label: "Telefone" }, { value: "EMAIL", label: "E-mail" }] },
      ]} />
    </details> : <p>Modo de leitura.</p>}
    <h2>Histórico</h2>{!data.bookings.length ? <p>Ainda não existem reservas.</p> : null}
    {data.bookings.map((booking) => <article className="operator-card" key={booking.id} aria-label={`Reserva de ${booking.customer.name}`}>
      <h3>{booking.serviceName}</h3><p>{bookingLabels[booking.status]} · {booking.passengers} passageiros · {money(booking.totalPriceCents, booking.currency)}</p>
      <p>{localLabel(booking.startsAt, booking.timeZone).replace("T", " ")} → {localLabel(booking.endsAt, booking.timeZone).replace("T", " ")} ({booking.timeZone})</p>
      <p>{booking.customer.name} · {booking.customer.email} · {booking.customer.phone}</p><p>Encontro: {booking.meetingPoint}</p>
      <p><Link href={`/operator/${organizationId}/dispatch/${booking.id}`}>Ver distribuição</Link></p>
      {booking.status === "ASSIGNED" && booking.occupancy ? <p>Atribuição de teste: {booking.occupancy.driver.name} · {booking.occupancy.vehicle.name}</p> : null}
      {booking.pickup ? <p>Recolha: {booking.pickup} · {booking.pickupRules}</p> : null}{booking.notes ? <p>Observações: {booking.notes}</p> : null}
      <details><summary>Eventos da reserva</summary><ul>{booking.events.map((event) => <li key={event.id}>{bookingLabels[event.type]} · {localLabel(event.createdAt, booking.timeZone).replace("T", " ")}</li>)}</ul></details>
      {canManage && booking.status !== "CANCELLED" ? <ResourceForm fields={[]} label="Cancelar reserva" action={cancelAction.bind(null, organizationId, booking.id, booking.version)} /> : null}
    </article>)}
    <nav aria-label="Páginas de reservas">{page > 1 ? <Link href={`?page=${page - 1}`}>Anterior</Link> : null} <span>Página {page}</span> {data.hasNext ? <Link href={`?page=${page + 1}`}>Seguinte</Link> : null}</nav>
  </main>;
}
