"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { configureRetell, verifyRetellConnection, IntegrationError } from "@/modules/integrations";
import type { ResourceFormState } from "@/types/operator-core";
export async function configureRetellAction(organizationId: string, version: number, _state: ResourceFormState, form: FormData): Promise<ResourceFormState> {
  void _state;
  try { await configureRetell(organizationId, { agentId: form.get("agentId"), expectedVersion: version, enabled: form.get("enabled") === "on" }); }
  catch (error) { return { error: error instanceof IntegrationError ? error.message : error instanceof ZodError ? "Verifique o identificador do agente." : "Não foi possível guardar. Verifique o seu acesso e atualize a página." }; }
  revalidatePath(`/admin/operators/${organizationId}/integrations`); revalidatePath(`/operator/${organizationId}/integrations`); revalidatePath("/admin/control");
  return { error: null };
}
export async function verifyRetellAction(organizationId: string, version: number, _state: ResourceFormState, _form: FormData): Promise<ResourceFormState> {
  void _state; void _form;
  try { await verifyRetellConnection(organizationId, version); }
  catch (error) { return { error: error instanceof IntegrationError ? error.message : "Não foi possível verificar. Confira o seu acesso e atualize a página." }; }
  revalidatePath(`/admin/operators/${organizationId}/integrations`); revalidatePath(`/operator/${organizationId}/integrations`); revalidatePath("/admin/control");
  return { error: null };
}
