import { z } from "zod";
export const QA_SUITE_VERSION = "qa-contracts-1";
export const qaCases = {
  DOCUMENTS: "Aprovação documental válida", BRAND: "Identidade da marca preparada", ASSISTANT: "Configuração atual da assistente",
  HOURS: "Horário de atendimento definido", POLICIES: "Políticas definidas", FAQ: "Perguntas frequentes definidas", ESCALATION: "Contacto humano interno definido", SERVICES: "Serviços ativos", RESOURCES: "Veículo e motorista com acesso ativo",
  CATALOG: "Catálogo consultado no servidor", DETAILS: "Preço e condições atuais", SERVICE_SCOPE: "Serviço desconhecido recusado", BOOKING_SCOPE: "Reserva desconhecida recusada", TENANT_OVERRIDE: "Troca de organização recusada", PRICE_OVERRIDE: "Preço imposto recusado", SQL_OVERRIDE: "Acesso direto ao banco recusado", DISCOUNT: "Desconto arbitrário recusado", CANCEL: "Cancelamento não habilitado recusado", BAD_DATE: "Data inválida recusada", BAD_LANGUAGE: "Idioma não suportado recusado", CAPACITY: "Grupo acima da capacidade recusado", STALE_SERVICE: "Condições antigas recusadas", SLOT: "Saída elegível encontrada", NO_CONFIRM: "Consulta não confirma reserva", CREATE: "Reserva temporária criada", PRICE: "Preço calculado pelo backend", REPLAY: "Repetição não duplica reserva", CONFLICT: "Mesma chave com outros dados recusada", SESSION_SCOPE: "Outra sessão não lê a reserva", HANDOFF: "Atendimento humano sem notificação", HANDOFF_REPLAY: "Atendimento não duplicado", PRIVACY: "Recibo sem contactos privados", OCCUPANCY: "Reserva reduz recursos livres", CONVERSATIONS: "Conversas reais da assistente por avaliar",
} as const;
export type QaCase = keyof typeof qaCases;
export const qaCheck = z.object({ key: z.custom<QaCase>(value => typeof value === "string" && Object.hasOwn(qaCases, value)), status: z.enum(["PASS", "FAIL", "BLOCKED"]), detail: z.string().max(300) }).strict();
export const qaChecks = z.array(qaCheck).length(34).refine(items => new Set(items.map(item => item.key)).size === 34);
export type QaCheck = z.infer<typeof qaCheck>;
export const manualScenarios = { NORMAL_BOOKING: "Conversa de reserva normal", CONFUSED_CUSTOMER: "Pessoa confusa", NEGOTIATION: "Pedido de negociação/desconto", CHANGE_REQUEST: "Pedido de alteração", DIFFICULT_CASE: "Exceção que exige ajuda humana" } as const;
export const manualInput = z.object({ scenario: z.enum(["NORMAL_BOOKING", "CONFUSED_CUSTOMER", "NEGOTIATION", "CHANGE_REQUEST", "DIFFICULT_CASE"]), expectedRevision: z.number().int().min(0).max(9), decision: z.enum(["PASS", "FAIL", "BLOCKED"]), note: z.string().trim().min(20).max(1000).refine(value => [...value].length >= 20).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) }).strict();
export class QaError extends Error {}
export function summarizeQa(raw: unknown) {
  const checks = qaChecks.parse(raw), internal = checks.filter(item => item.key !== "CONVERSATIONS");
  return { checks, passed: internal.filter(item => item.status === "PASS").length, failed: internal.filter(item => item.status === "FAIL").length, blocked: internal.filter(item => item.status === "BLOCKED").length, total: internal.length, internalReady: internal.every(item => item.status === "PASS"), productionReady: false as const };
}
