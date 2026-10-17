"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runOperatorQa, QaError } from "@/modules/qa";
import { ComplianceError } from "@/modules/compliance";
import type { ResourceFormState } from "@/types/operator-core";
export async function runQaAction(organizationId: string, _state: ResourceFormState, _form: FormData): Promise<ResourceFormState> {
  void _state; void _form; let id: string;
  try { id = await runOperatorQa(organizationId); } catch (error) { return { error: error instanceof QaError || error instanceof ComplianceError ? error.message : "Não foi possível concluir a bateria. Verifique o seu acesso e tente novamente." }; }
  revalidatePath(`/operator/${organizationId}/qa`); revalidatePath(`/admin/operators/${organizationId}/qa`);
  redirect(`/operator/${organizationId}/qa?run=${id}`);
}
