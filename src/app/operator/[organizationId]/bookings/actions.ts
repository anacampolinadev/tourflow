"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { createBooking, cancelBooking, BookingError } from "@/modules/bookings";
import { ComplianceError } from "@/modules/compliance";
import { AvailabilityError } from "@/modules/availability";
import type { ResourceFormState } from "@/types/operator-core";

function failure(error: unknown): ResourceFormState {
  if (error instanceof BookingError || error instanceof ComplianceError || error instanceof AvailabilityError) return { error: error.message };
  if (error instanceof ZodError) return { error: "Verifique os dados do cliente, a data, a hora e o número de passageiros." };
  return { error: "Não foi possível guardar a reserva. Verifique o seu acesso e atualize a página." };
}
function refresh(organizationId: string): never {
  revalidatePath(`/operator/${organizationId}/bookings`);
  revalidatePath(`/operator/${organizationId}/calendar`);
  redirect(`/operator/${organizationId}/bookings?saved=1`);
}
export async function bookingAction(organizationId: string, idempotencyKey: string, _state: ResourceFormState, form: FormData): Promise<ResourceFormState> {
  try {
    await createBooking(organizationId, { idempotencyKey, serviceId: form.get("serviceId"), date: form.get("date"), time: form.get("time"), passengers: Number(form.get("passengers")), language: form.get("language") || undefined, customerName: form.get("customerName"), customerEmail: form.get("customerEmail"), customerPhone: form.get("customerPhone"), pickup: form.get("pickup"), notes: form.get("notes"), source: form.get("source") });
  } catch (error) { return failure(error); }
  refresh(organizationId);
}
export async function cancelAction(organizationId: string, bookingId: string, version: number, _state: ResourceFormState, _form: FormData): Promise<ResourceFormState> {
  void _state; void _form;
  try { await cancelBooking(organizationId, bookingId, version); } catch (error) { return failure(error); }
  refresh(organizationId);
}
