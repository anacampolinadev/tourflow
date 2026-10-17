import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, currentActor } from "@/modules/auth";
import { readDispatch, DispatchError } from "@/modules/dispatch";
import { bookingLabels } from "@/modules/bookings";
import { localLabel } from "@/modules/availability";
import { ResourceForm } from "@/components/resource-form";
import { dispatchAction } from "./actions";
export const dynamic = "force-dynamic";

export default async function Dispatch({ params, searchParams }: { params: Promise<{ organizationId: string; bookingId: string }>; searchParams: Promise<{ result?: string }> }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId, bookingId } = await params, query = await searchParams;
  const data = await readDispatch(organizationId, bookingId).catch((error: unknown) => { if (error instanceof AccessDenied || error instanceof DispatchError) notFound(); throw error; });
  const { booking, preview } = data;
  const canManage = ["OPERATOR_OWNER", "OPERATOR_DISPATCHER"].includes(data.context.role);
  return <main className="operator-catalog"><Link href={`/operator/${organizationId}/bookings`}>Reservas</Link>
    <h1>Distribuição interna</h1><h2>{booking.serviceName}</h2>
    <p>{bookingLabels[booking.status]} · {booking.passengers} passageiros · {localLabel(booking.startsAt, booking.timeZone).replace("T", " ")} ({booking.timeZone})</p>
    <p>Modo de teste. Não envia pedidos ao motorista nem confirma aptidão documental individual. A aprovação documental do operador é obrigatória.</p>
    {booking.occupancy && booking.status !== "CANCELLED" ? <p>Recursos {!["CONFIRMED", "DRIVER_DECLINED"].includes(booking.status) ? "atribuídos em teste" : "ocupados provisoriamente"}: {booking.occupancy.driver.name} · {booking.occupancy.vehicle.name}</p> : null}
    {query.result === "assigned" ? <p role="status">Atribuição de teste guardada.</p> : query.result === "unavailable" ? <p role="alert">Sem candidatos elegíveis. A ocupação anterior foi preservada.</p> : null}
    {data.unavailable ? <p role="alert">{data.unavailable}</p> : null}
    <h2>Critérios da escolha</h2><p>Disponibilidade 25%, proximidade 20%, equilíbrio de carga 20%, capacidade adequada 15%, avaliação 10%, idioma 5% e aceitação 5%. Proximidade, avaliação e aceitação usam 50% neutros enquanto não houver dados. Sem preferência de idioma, esse fator também é neutro.</p>
    <p>A carga conta outras reservas atribuídas entre 30 dias antes e 24 horas após a saída. Menos atribuições recebem maior pontuação. Em empate, usa-se carga e identificadores estáveis.</p>
    {preview ? <>
      <h2>Candidatos atuais</h2><p>Prévia da agenda; os dados são novamente verificados ao guardar.</p>
      {!preview.ranking.length ? <p>Nenhum par elegível neste momento.</p> : <ul className="resource-list">{preview.ranking.map((row) => <li key={row.driverId}>
        <strong>{preview.drivers.find((driver) => driver.id === row.driverId)?.name}</strong> · {(row.score / 100).toFixed(2)} pontos
        <p>{row.assignments} atribuições na janela · melhor veículo: {preview.availability.eligibleVehicles.find((vehicle) => vehicle.id === row.vehicleId)?.name} · {row.capacity} lugares</p>
      </li>)}</ul>}
      {canManage ? <section><h2>Atribuir recursos</h2>
        <ResourceForm key={`auto-${booking.version}`} fields={[]} label="Distribuir automaticamente" action={dispatchAction.bind(null, organizationId, bookingId, booking.version, randomUUID(), "AUTO")} />
        {preview.ranking.length ? <details><summary>Escolher manualmente</summary><p>Todos os filtros de elegibilidade continuam obrigatórios. Indique o motivo sem dados pessoais.</p>
          <ResourceForm key={`manual-${booking.version}`} preserveOnError label="Guardar atribuição manual" action={dispatchAction.bind(null, organizationId, bookingId, booking.version, randomUUID(), "MANUAL")} fields={[
            { name: "driverId", label: "Motorista elegível", type: "select", value: "", options: [{ value: "", label: "Selecione" }, ...preview.drivers.map((driver) => ({ value: driver.id, label: driver.name }))] },
            { name: "vehicleId", label: "Veículo elegível", type: "select", value: "", options: [{ value: "", label: "Selecione" }, ...preview.availability.eligibleVehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.name }))] },
            { name: "reason", label: "Justificação", type: "textarea", value: "", required: true, maxLength: 500 },
          ]} />
        </details> : null}
      </section> : <p>Modo de leitura.</p>}
    </> : null}
    <h2>Últimas 20 decisões</h2>{!data.decisions.length ? <p>Ainda não há decisões de distribuição.</p> : null}
    <ul className="resource-list">{data.decisions.map((decision) => <li key={decision.id}>
      <strong>{decision.outcome === "ASSIGNED" ? decision.mode === "MANUAL" ? "Atribuição manual" : "Atribuição automática" : "Sem candidatos"}</strong>
      <p>{localLabel(decision.createdAt, booking.timeZone).replace("T", " ")} · versão {decision.bookingVersion}</p>
      {decision.driver && decision.vehicle ? <p>{decision.driver.name} · {decision.vehicle.name} · {((decision.score ?? 0) / 100).toFixed(2)} pontos</p> : null}
      <p>{decision.reason}</p>
    </li>)}</ul>
  </main>;
}
