"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { dispatchBooking, DispatchError } from "@/modules/dispatch";
import { ComplianceError } from "@/modules/compliance";
import type { ResourceFormState } from "@/types/operator-core";

export async function dispatchAction(organizationId: string, bookingId: string, version: number, key: string, mode: "AUTO" | "MANUAL", _state: ResourceFormState, form: FormData): Promise<ResourceFormState> {
  let outcome: string;
  try {
    const decision = await dispatchBooking(organizationId, bookingId, { expectedVersion: version, idempotencyKey: key, mode, ...(mode === "MANUAL" ? { driverId: form.get("driverId"), vehicleId: form.get("vehicleId"), reason: form.get("reason") } : {}) });
    outcome = decision.outcome;
  } catch (error) {
    if (error instanceof DispatchError || error instanceof ComplianceError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Selecione os recursos e indique uma justificação com 5 a 500 caracteres." };
    return { error: "Não foi possível distribuir. Verifique o acesso e atualize a página." };
  }
  revalidatePath(`/operator/${organizationId}/bookings`);
  revalidatePath(`/operator/${organizationId}/calendar`);
  revalidatePath(`/operator/${organizationId}/dispatch/${bookingId}`);
  redirect(`/operator/${organizationId}/dispatch/${bookingId}?result=${outcome === "ASSIGNED" ? "assigned" : "unavailable"}`);
}
