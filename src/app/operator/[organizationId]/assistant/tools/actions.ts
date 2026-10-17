"use server";
import { redirect } from "next/navigation";
import { startAssistantSession, executeAssistantTool, ToolError, type ToolFormState, type ToolName } from "@/modules/assistants";
import { ComplianceError } from "@/modules/compliance";
import type { ResourceFormState } from "@/types/operator-core";
export async function startSessionAction(organizationId: string, _state: ResourceFormState, _form: FormData): Promise<ResourceFormState> {
  void _state; void _form;
  let id: string;
  try { id = await startAssistantSession(organizationId); } catch (error) { return { error: error instanceof ToolError || error instanceof ComplianceError ? error.message : "Não foi possível iniciar a sessão. Verifique o seu acesso." }; }
  redirect(`/operator/${organizationId}/assistant/tools?session=${id}`);
}
export async function toolAction(organizationId: string, conversationId: string, callId: string, tool: ToolName, serviceVersions: Record<string, number>, _state: ToolFormState, form: FormData): Promise<ToolFormState> {
  void _state;
  const query = { serviceId: form.get("serviceId"), date: form.get("date"), time: form.get("time"), passengers: Number(form.get("passengers")), language: form.get("language") };
  const input = tool === "get_services" ? { page: Number(form.get("page")) } : tool === "get_service_details" ? { serviceId: form.get("serviceId") } : tool === "check_availability" ? query : tool === "create_booking" ? { ...query, serviceVersion: serviceVersions[String(form.get("serviceId"))], customerName: form.get("customerName"), customerEmail: form.get("customerEmail"), customerPhone: form.get("customerPhone"), pickup: form.get("pickup") ?? "" } : tool === "get_booking" ? { bookingId: form.get("bookingId") } : { reason: form.get("reason") };
  try {
    const result = await executeAssistantTool(organizationId, conversationId, callId, { tool, input });
    return { result, error: null };
  } catch { return { result: null, error: "Não foi possível executar o pedido. Atualize a página e verifique o seu acesso." }; }
}
