"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actOnDriverBooking, DriverPortalError, type DriverCommandType } from "@/modules/drivers";
import { ComplianceError } from "@/modules/compliance";
import type { ResourceFormState } from "@/types/operator-core";

export async function driverAction(organizationId: string, bookingId: string, expectedVersion: number, type: DriverCommandType, idempotencyKey: string, _state: ResourceFormState, _form: FormData): Promise<ResourceFormState> {
  void _state; void _form;
  try { await actOnDriverBooking(organizationId, bookingId, { type, expectedVersion, idempotencyKey }); }
  catch (error) { return { error: error instanceof DriverPortalError || error instanceof ComplianceError ? error.message : "Não foi possível guardar. Verifique a ligação e atualize os serviços." }; }
  revalidatePath(`/driver/${organizationId}`);
  revalidatePath(`/operator/${organizationId}`, "layout");
  redirect(`/driver/${organizationId}?saved=1`);
}
