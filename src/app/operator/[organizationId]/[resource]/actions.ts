"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { CatalogConflict, CatalogUnavailable } from "@/modules/tenants";
import { createService, updateService, servicePriceToCents } from "@/modules/services";
import { createVehicle, updateVehicle } from "@/modules/vehicles";
import { createDriver, updateDriver, changeDriverStatus, InvalidDriverTransition } from "@/modules/drivers";
import { currentTenant, requirePermission } from "@/modules/auth";
import type { ResourceKind, ResourceFormState } from "@/types/operator-core";
function message(error: unknown): ResourceFormState {
  if (error instanceof CatalogConflict || error instanceof CatalogUnavailable || error instanceof InvalidDriverTransition) return { error: error.message };
  if (error instanceof ZodError) return { error: "Verifique os campos, os limites e os idiomas. Se permitir recolha, indique as regras." };
  return { error: "Não foi possível guardar. Verifique o seu acesso e os dados, ou atualize a página." };
}
function refresh(organizationId: string, kind: ResourceKind, id: string) {
  revalidatePath(`/operator/${organizationId}/${kind}`);
  revalidatePath(`/operator/${organizationId}/${kind}/${id}`);
}
export async function saveResource(organizationId: string, kind: ResourceKind, id: string | null, version: number | null, _state: ResourceFormState, form: FormData): Promise<ResourceFormState> {
  let savedId = id;
  try {
    const context = await currentTenant(organizationId);
    requirePermission(context, kind === "services" ? "catalog:manage" : "resources:manage");
    if (id && version === null) throw new CatalogConflict();
    switch (kind) {
      case "services": {
        const pickupAvailable = form.get("pickupAvailable") === "on";
        const input = { name: form.get("name"), description: form.get("description"), durationMinutes: Number(form.get("durationMinutes")), pricingType: form.get("pricingType"), basePriceCents: servicePriceToCents(String(form.get("basePrice") ?? "")), currency: "EUR", capacity: Number(form.get("capacity")), meetingPoint: form.get("meetingPoint"), pickupAvailable, pickupRules: pickupAvailable ? form.get("pickupRules") : "", languages: form.getAll("languages"), active: form.get("active") === "on" };
        if (id) await updateService(organizationId, id, version ?? -1, input); else savedId = (await createService(organizationId, input)).id;
        break;
      }
      case "vehicles": {
        const input = { name: form.get("name"), type: form.get("type"), registration: form.get("registration"), capacity: Number(form.get("capacity")), features: String(form.get("features") ?? "").split(",").map((value) => value.trim()).filter(Boolean), active: form.get("active") === "on" };
        if (id) await updateVehicle(organizationId, id, version ?? -1, input); else savedId = (await createVehicle(organizationId, input)).id;
        break;
      }
      case "drivers": {
        const input = { name: form.get("name"), phone: form.get("phone"), email: form.get("email"), languages: form.getAll("languages") };
        if (id) await updateDriver(organizationId, id, version ?? -1, input); else savedId = (await createDriver(organizationId, input)).id;
        break;
      }
      default: throw new CatalogConflict();
    }
  } catch (error) { return message(error); }
  if (!savedId) return { error: "Não foi possível guardar." };
  refresh(organizationId, kind, savedId);
  redirect(`/operator/${organizationId}/${kind}/${savedId}?saved=1`);
}
export async function saveDriverStatus(organizationId: string, id: string, version: number, _state: ResourceFormState, form: FormData): Promise<ResourceFormState> {
  try { await changeDriverStatus(organizationId, id, version, form.get("status")); } catch (error) { return message(error); }
  refresh(organizationId, "drivers", id);
  redirect(`/operator/${organizationId}/drivers/${id}?saved=1`);
}
