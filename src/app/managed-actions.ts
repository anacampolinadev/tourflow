"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { actOnHandoff, ManagedOpsError, type ManagedScope } from "@/modules/managed-ops";
import type { ResourceFormState } from "@/types/operator-core";
export async function handoffAction(organizationId: string, handoffId: string, scope: ManagedScope, expectedVersion: number, action: "CLAIM" | "RELEASE" | "RESOLVE" | "REOPEN", _state: ResourceFormState, form: FormData): Promise<ResourceFormState> {
  void _state;
  try { await actOnHandoff(organizationId, handoffId, scope, { expectedVersion, action, note: form.get("note") ?? "" }); }
  catch (error) { return { error: error instanceof ManagedOpsError ? error.message : error instanceof ZodError ? "Verifique a nota: use 10–1000 caracteres na resolução." : "Não foi possível alterar o atendimento. Verifique o seu acesso e atualize a página." }; }
  revalidatePath(`/operator/${organizationId}/control`); revalidatePath(`/admin/operators/${organizationId}/control`); revalidatePath("/admin/control");
  return { error: null };
}
