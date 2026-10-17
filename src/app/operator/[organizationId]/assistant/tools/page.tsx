import { randomUUID } from "node:crypto";
import Link from "next/link";
import { z } from "zod";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, currentActor } from "@/modules/auth";
import { executeAssistantTool, readAssistantSession, readAssistantHandoffs, type ToolName } from "@/modules/assistants";
import { ResourceForm } from "@/components/resource-form";
import { AssistantToolForm } from "@/components/assistant-tool-form";
import type { ResourceField } from "@/types/operator-core";
import { languageLabels } from "@/types/languages";
import { startSessionAction, toolAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function ToolsPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ session?: string; catalogPage?: string }> }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId } = await params, search = await searchParams, id = search.session;
  if (id && !z.uuid().safeParse(id).success) notFound();
  const page = Number(search.catalogPage ?? "1"); if (!Number.isInteger(page) || page < 1 || page > 10000) notFound();
  const queue = await readAssistantHandoffs(organizationId).catch((error: unknown) => { if (error instanceof AccessDenied) notFound(); throw error; });
  const session = id ? await readAssistantSession(organizationId, id).catch((error: unknown) => { if (error instanceof AccessDenied) notFound(); throw error; }) : null;
  const catalog = session ? await executeAssistantTool(organizationId, session.id, randomUUID(), { tool: "get_services", input: { page } }) : null;
  const services = catalog?.services;
  type Field = Exclude<ResourceField, { type: "checkbox" | "languages" }>;
  const serviceField: Field = { name: "serviceId", label: "Serviço", type: "select", value: services?.items[0]?.id ?? "", options: services?.items.map(service => ({ value: service.id, label: service.name })) ?? [] };
  const query: Field[] = [serviceField, { name: "date", label: "Data", type: "date", value: "", required: true }, { name: "time", label: "Hora de saída", type: "time", value: "10:00", required: true }, { name: "passengers", label: "Passageiros", type: "number", value: "1", min: 1, max: 100, required: true }, { name: "language", label: "Idioma pedido", type: "select", value: session?.languages[0] ?? "pt", options: (session?.languages ?? []).map(language => ({ value: language, label: languageLabels[language] })) }];
  const serviceVersions = Object.fromEntries((services?.items ?? []).map(service => [service.id, service.version]));
  const form = (tool: ToolName, fields: Field[], label: string) => {
    const callId = randomUUID();
    return session ? <AssistantToolForm key={callId} fields={fields} label={label} action={toolAction.bind(null, organizationId, session.id, callId, tool, serviceVersions)} /> : null;
  };
  return <main className="operator-catalog narrow"><Link href={`/operator/${organizationId}/assistant`}>Configuração da assistente</Link><h1>Ferramentas da Alana</h1>
    <p className="sandbox-note">Testes internos manuais com dados reais de SANDBOX. Sem modelo de IA ou canal de turistas. Criar uma reserva ocupa recursos de teste; consultar disponibilidade não segura lugares.</p>
    <p><Link href={`/operator/${organizationId}/bookings`}>Consultar reservas do operador</Link></p>
    <ResourceForm fields={[]} label="Iniciar nova sessão de teste" action={startSessionAction.bind(null, organizationId)} />
    <p>Exige configuração atual guardada e aprovação documental. Cada sessão dura 24 horas e só é acessível a quem a iniciou.</p>
    {session ? <><p>Configuração versão {session.assistantVersion}. Sessão válida até {session.expiresAt.toISOString()}.</p>
      <section aria-label="Catálogo de serviços"><h2>Serviços atuais</h2>{catalog && !catalog.success ? <p role="alert">{catalog.message}</p> : services ? <><ul>{services.items.map(service => <li key={service.id}>{service.name} · {new Intl.NumberFormat("pt-PT", { style: "currency", currency: service.currency }).format(service.basePriceCents / 100)} {service.pricingType === "PER_PERSON" ? "por pessoa" : "por grupo"}</li>)}</ul><p>Página {services.page} · {services.total} serviços ativos</p>{page > 1 ? <Link href={`?session=${session.id}&catalogPage=${page - 1}`}>Serviços anteriores</Link> : null}{page * 25 < services.total ? <Link href={`?session=${session.id}&catalogPage=${page + 1}`}>Serviços seguintes</Link> : null}</> : null}</section>
      <section aria-label="Detalhes do serviço"><h2>Consultar detalhes</h2>{form("get_service_details", [serviceField], "Consultar serviço")}</section>
      <section aria-label="Consulta de disponibilidade"><h2>Verificar disponibilidade</h2>{form("check_availability", query, "Verificar recursos de teste")}</section>
      <section aria-label="Criação de reserva"><h2>Criar reserva de teste</h2><p>Ao enviar, confirma este pedido interno. O servidor calcula o preço e revalida disponibilidade e documentos.</p>{form("create_booking", [...query, { name: "customerName", label: "Nome do cliente", type: "text", value: "", maxLength: 120, required: true }, { name: "customerEmail", label: "E-mail do cliente", type: "email", value: "", maxLength: 254, required: true }, { name: "customerPhone", label: "Telefone do cliente", type: "tel", value: "", maxLength: 30, required: true }, { name: "pickup", label: "Recolha pedida (opcional)", type: "text", value: "", maxLength: 300 }], "Criar reserva pela Alana")}</section>
      <section aria-label="Consulta de reserva"><h2>Consultar reserva desta sessão</h2>{form("get_booking", [{ name: "bookingId", label: "Referência da reserva", type: "text", value: "", maxLength: 100, required: true }], "Consultar estado da reserva")}</section>
      <section aria-label="Pedido de atendimento humano"><h2>Pedir atendimento humano</h2><p>Regista um pedido pendente na fila interna. Não envia mensagens nem confirma que alguém foi contactado. Um pedido por sessão; pedidos seguintes mantêm o motivo original.</p>{form("handoff_to_human", [{ name: "reason", label: "Motivo do pedido", type: "textarea", value: "", maxLength: 500, required: true }], "Registar pedido de atendimento")}</section>
    </> : null}
    <section aria-label="Fila de atendimento"><h2>Pedidos pendentes de atendimento</h2><p>Últimos 50 pedidos deste operador. Atualize o painel para consultar novos pedidos.</p>{queue.length ? <ul>{queue.map(item => <li key={item.id}><strong>{item.id}</strong><p>{item.reason}</p><p>Pendente · {item.createdAt.toISOString()} · Sem mensagem enviada</p></li>)}</ul> : <p>Sem pedidos registados.</p>}</section>
  </main>;
}
