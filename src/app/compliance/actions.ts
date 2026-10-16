"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import type { ComplianceFormState } from "@/components/compliance-form";
import { currentTenant, requirePermission } from "@/modules/auth";
import { OperatorConflict } from "@/modules/tenants";
import { ComplianceError, MAX_FILE_BYTES, addRequirement, deactivateRequirement, uploadDocument, submitDocuments, reviewDocument, requestCorrections, approveOperator } from "@/modules/compliance";

type Command = "add" | "deactivate" | "upload" | "submit" | "review" | "correct" | "approve";
export async function complianceAction(organizationId: string, version: number, command: Command, targetId: string, _state: ComplianceFormState, form: FormData): Promise<ComplianceFormState> {
  try {
    switch (command) {
      case "add": await addRequirement(organizationId, version, { title: form.get("title"), requiresExpiry: form.get("requiresExpiry") === "on" }); break;
      case "deactivate": await deactivateRequirement(organizationId, version, targetId); break;
      case "upload": {
        requirePermission(await currentTenant(organizationId), "compliance:manage");
        const file = form.get("file");
        if (!(file instanceof File) || !file.size || file.size > MAX_FILE_BYTES) throw new ComplianceError("Selecione um ficheiro de até 2 MB.");
        await uploadDocument(organizationId, version, { requirementId: targetId, fileName: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()), expiresOn: form.get("expiresOn") });
        break;
      }
      case "submit": await submitDocuments(organizationId, version); break;
      case "review": await reviewDocument(organizationId, version, targetId, form.get("decision"), form.get("note")); break;
      case "correct": await requestCorrections(organizationId, version, form.get("note")); break;
      case "approve": await approveOperator(organizationId, version); break;
      default: throw new ComplianceError("Ação inválida.");
    }
  } catch (error) {
    if (error instanceof ComplianceError || error instanceof OperatorConflict) return { error: error.message, saved: false };
    if (error instanceof ZodError) return { error: "Verifique os campos. As observações de correção devem ter entre 5 e 1000 caracteres.", saved: false };
    return { error: "Não foi possível guardar. Confirme o seu acesso e atualize a página.", saved: false };
  }
  revalidatePath(`/operator/${organizationId}/documents`);
  revalidatePath(`/admin/operators/${organizationId}/documents`);
  revalidatePath(`/admin/operators/${organizationId}`);
  revalidatePath("/admin/operators");
  return { error: null, saved: true };
}
