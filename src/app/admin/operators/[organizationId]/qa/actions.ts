"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { QaError, recordManualQa } from "@/modules/qa";
import { ComplianceError } from "@/modules/compliance";
import type { ResourceFormState } from "@/types/operator-core";
export async function manualQaAction(organizationId: string, runId: string, scenario: string, revision: number, _state: ResourceFormState, form: FormData): Promise<ResourceFormState> {
  void _state;
  try { await recordManualQa(organizationId, runId, { scenario, expectedRevision: revision, decision: form.get("decision"), note: form.get("note") }); } catch (error) { return { error: error instanceof QaError || error instanceof ComplianceError ? error.message : error instanceof ZodError ? "Verifique o resultado e descreva a evidência em 20–1000 caracteres." : "Não foi possível guardar. Verifique o seu acesso e atualize a página." }; }
  revalidatePath(`/admin/operators/${organizationId}/qa`); revalidatePath(`/operator/${organizationId}/qa`);
  redirect(`/admin/operators/${organizationId}/qa?run=${runId}`);
}
