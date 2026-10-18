import { z } from "zod";
export const providerId = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const retellInput = z.object({ agentId: providerId, enabled: z.boolean(), expectedVersion: z.number().int().min(0).max(9999) }).strict();
export const callEvents = ["call_started", "call_ended", "call_analyzed"] as const;
// Strip provider extras immediately; never persist transcript, recording, numbers, metadata or analysis.
export const retellEvent = z.object({ event: z.enum(callEvents), call: z.object({ agent_id: providerId, call_id: providerId }) });
export const checkLabels: Record<string, string> = { NOT_CHECKED: "Ainda não verificada", CHECKING: "Verificação iniciada", API_OK: "API e destino de eventos verificados", WEBHOOK_MISMATCH: "Destino de eventos ou agente diferente do esperado", MISSING_CONFIG: "Credencial, URL pública ou ativação em falta no servidor", UNAVAILABLE: "Não foi possível verificar a API" };
export class IntegrationError extends Error {}
