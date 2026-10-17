"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { BrandError, generateWhiteLabel, updateBrandIdentity, MAX_LOGO_BYTES } from "@/modules/branding";
import { ComplianceError } from "@/modules/compliance";
import type { ResourceFormState } from "@/types/operator-core";
function failure(error: unknown): ResourceFormState {
  return { error: error instanceof BrandError || error instanceof ComplianceError ? error.message : error instanceof ZodError ? "Verifique o nome e as cores no formato #123456." : "Não foi possível guardar. Verifique o seu acesso e atualize a página." };
}
function refresh(organizationId: string): never {
  revalidatePath(`/operator/${organizationId}`, "layout"); revalidatePath(`/driver/${organizationId}`, "layout");
  redirect(`/operator/${organizationId}/brand?saved=1`);
}
export async function generateBrandAction(organizationId: string, _state: ResourceFormState, _form: FormData): Promise<ResourceFormState> {
  void _state; void _form;
  try { await generateWhiteLabel(organizationId); } catch (error) { return failure(error); }
  refresh(organizationId);
}
export async function updateBrandAction(organizationId: string, version: number, _state: ResourceFormState, form: FormData): Promise<ResourceFormState> {
  void _state;
  try {
    const file = form.get("logo"), remove = form.get("removeLogo") === "on";
    const upload = file instanceof File && file.size > 0 ? file : null;
    if (upload && (upload.size > MAX_LOGO_BYTES || upload.type !== "image/png")) throw new BrandError("Envie um PNG até 256 KiB.");
    if (upload && remove) throw new BrandError("Escolha enviar ou remover o logótipo, não ambos.");
    await updateBrandIdentity(organizationId, version, { displayName: form.get("displayName"), primaryColor: form.get("primaryColor"), secondaryColor: form.get("secondaryColor") }, upload ? { type: "UPLOAD", data: new Uint8Array(await upload.arrayBuffer()) } : remove ? { type: "REMOVE" } : { type: "KEEP" });
  } catch (error) { return failure(error); }
  refresh(organizationId);
}
