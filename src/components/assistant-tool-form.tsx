"use client";
import { useActionState, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { ToolFormState, ToolResult } from "@/modules/assistants";
import type { ResourceField } from "@/types/operator-core";
type Field = Exclude<ResourceField, { type: "checkbox" | "languages" }>;
const money = (cents: number, currency: string) => new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(cents / 100);
export function AssistantToolResult({ result }: { result: ToolResult }) {
  return <div className="assistant-tool-result"><p role={result.success ? "status" : "alert"}>{result.message}</p>
    {result.service ? <dl><dt>Serviço</dt><dd>{result.service.name}</dd><dt>Descrição</dt><dd>{result.service.description || "Não definida"}</dd><dt>Preço do catálogo</dt><dd>{money(result.service.basePriceCents, result.service.currency)} {result.service.pricingType === "PER_PERSON" ? "por pessoa" : "por grupo"}</dd><dt>Duração</dt><dd>{result.service.durationMinutes} minutos</dd><dt>Encontro</dt><dd>{result.service.meetingPoint}</dd><dt>Recolha</dt><dd>{result.service.pickupAvailable ? result.service.pickupRules || "Disponível; confirme as condições." : "Não disponível"}</dd><dt>Idiomas</dt><dd>{result.service.languages.join(", ")}</dd><dt>Capacidade</dt><dd>{result.service.capacity}</dd></dl> : null}
    {result.availability ? <><p>{result.availability.available ? "Há recursos livres neste instante." : "Não há disponibilidade para este pedido."} Esta consulta não confirma nem segura uma reserva.</p><p>Consultado em {result.availability.checkedAt} · {result.availability.timeZone}</p>{result.availability.alternatives.length ? <ul>{result.availability.alternatives.map(item => <li key={item.startsAt}>{item.date} às {item.time}</li>)}</ul> : null}</> : null}
    {result.booking ? <dl><dt>Referência da reserva</dt><dd className="assistant-reference">{result.booking.id}</dd><dt>Serviço reservado</dt><dd>{result.booking.serviceName}</dd><dt>Estado atual</dt><dd>{result.booking.statusLabel}</dd><dt>Saída</dt><dd>{new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short", timeZone: result.booking.timeZone }).format(new Date(result.booking.startsAt))} · {result.booking.timeZone}</dd><dt>Passageiros</dt><dd>{result.booking.passengers}</dd><dt>Total preservado</dt><dd>{money(result.booking.totalPriceCents, result.booking.currency)}</dd><dt>Encontro</dt><dd>{result.booking.meetingPoint}</dd></dl> : null}
    {result.handoff ? <p>Pedido {result.handoff.id} · {result.handoff.status === "RESOLVED" ? "Atendimento concluído" : result.handoff.status === "IN_PROGRESS" ? "Em atendimento interno" : "Pendente de atendimento interno"}. Sem notificação enviada.</p> : null}
  </div>;
}
export function AssistantToolForm({ fields, label, action }: { fields: Field[]; label: string; action: (state: ToolFormState, form: FormData) => Promise<ToolFormState> }) {
  const [state, submit, pending] = useActionState(action, { result: null, error: null });
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(field => [field.name, field.value])));
  const formId = useId(), router = useRouter();
  return <><form action={submit}>
    {state.error ? <p role="alert">{state.error}</p> : null}
    <fieldset disabled={pending} className="resource-fields"><legend className="sr-only">Dados do pedido</legend>{fields.map(field => {
      const id = `${formId}-${field.name}`, value = values[field.name] ?? "", onChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues(previous => ({ ...previous, [field.name]: event.target.value }));
      return <div key={field.name}><label htmlFor={id}>{field.label}</label>{field.type === "select" ? <select id={id} name={field.name} value={value} onChange={onChange}>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "textarea" ? <textarea id={id} name={field.name} value={value} onChange={onChange} maxLength={field.maxLength} required={field.required} /> : <input id={id} name={field.name} type={field.type} value={value} onChange={onChange} min={field.min} max={field.max} maxLength={field.maxLength} required={field.required} />}</div>;
    })}</fieldset><button type="submit" disabled={pending}>{pending ? "A consultar…" : label}</button>
  </form>{state.result ? <AssistantToolResult result={state.result} /> : null}{state.result?.success ? <button type="button" disabled={pending} onClick={() => router.refresh()}>Novo pedido e atualizar painel</button> : null}</>;
}
