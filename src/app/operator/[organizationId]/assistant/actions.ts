"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AssistantError, initializeAssistant, updateAssistant } from "@/modules/assistants";
import { ComplianceError } from "@/modules/compliance";
import type { ResourceFormState } from "@/types/operator-core";
function failure(error: unknown): ResourceFormState {
  return { error: error instanceof AssistantError || error instanceof ComplianceError ? error.message : error instanceof ZodError ? "Verifique os campos, os idiomas e os contactos. Os limites indicados devem ser respeitados." : "Não foi possível guardar. Verifique o seu acesso e atualize a página." };
}
function refresh(organizationId: string): never {
  revalidatePath(`/operator/${organizationId}/assistant`);
  redirect(`/operator/${organizationId}/assistant?saved=1`);
}
export async function initializeAssistantAction(organizationId: string, _state: ResourceFormState, _form: FormData): Promise<ResourceFormState> {
  void _state; void _form;
  try { await initializeAssistant(organizationId); } catch (error) { return failure(error); }
  refresh(organizationId);
}
export async function updateAssistantAction(organizationId: string, version: number, _state: ResourceFormState, form: FormData): Promise<ResourceFormState> {
  void _state;
  try {
    await updateAssistant(organizationId, version, { operatorName: form.get("operatorName"), assistantName: form.get("assistantName"), tone: form.get("tone"), languages: form.getAll("languages"), openingHours: form.get("openingHours"), policies: form.get("policies"), faqs: form.get("faqs"), escalationName: form.get("escalationName"), escalationEmail: form.get("escalationEmail"), escalationPhone: form.get("escalationPhone") });
  } catch (error) { return failure(error); }
  refresh(organizationId);
}
