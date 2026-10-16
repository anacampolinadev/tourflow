"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { addServiceSchedule, linkServiceVehicle, addDriverWindow, addResourceBlock, deactivateCalendarEntry, setCalendarTimeZone, AvailabilityError, localDate } from "@/modules/availability";
import { CatalogConflict, CatalogUnavailable } from "@/modules/tenants";
import type { ResourceFormState } from "@/types/operator-core";
type Command = "schedule" | "link" | "window" | "block" | "zone" | "cancel-schedule" | "cancel-link" | "cancel-window" | "cancel-block";
export async function calendarAction(organizationId: string, version: number, date: string, command: Command, id: string, _state: ResourceFormState, form: FormData): Promise<ResourceFormState> {
  try {
    localDate.parse(date);
    switch (command) {
      case "zone": await setCalendarTimeZone(organizationId, version, form.get("timeZone")); break;
      case "schedule": await addServiceSchedule(organizationId, version, { serviceId: form.get("serviceId"), weekday: Number(form.get("weekday")), time: form.get("time"), validFrom: form.get("validFrom"), validUntil: form.get("validUntil"), bufferBeforeMinutes: Number(form.get("bufferBeforeMinutes")), bufferAfterMinutes: Number(form.get("bufferAfterMinutes")) }); break;
      case "link": await linkServiceVehicle(organizationId, version, { serviceId: form.get("serviceId"), vehicleId: form.get("vehicleId") }); break;
      case "window": await addDriverWindow(organizationId, version, { driverId: form.get("driverId"), startLocal: form.get("startLocal"), endLocal: form.get("endLocal") }); break;
      case "block": {
        const resource = String(form.get("resource") ?? "").split(":");
        if (resource.length !== 2) throw new CatalogConflict();
        await addResourceBlock(organizationId, version, { resourceType: resource[0], resourceId: resource[1], startLocal: form.get("startLocal"), endLocal: form.get("endLocal"), reason: form.get("reason") }); break;
      }
      case "cancel-schedule": await deactivateCalendarEntry(organizationId, version, "schedule", id); break;
      case "cancel-link": await deactivateCalendarEntry(organizationId, version, "link", id); break;
      case "cancel-window": await deactivateCalendarEntry(organizationId, version, "window", id); break;
      case "cancel-block": await deactivateCalendarEntry(organizationId, version, "block", id); break;
      default: throw new CatalogConflict();
    }
  } catch (error) {
    if (error instanceof AvailabilityError || error instanceof CatalogConflict || error instanceof CatalogUnavailable) return { error: error.message };
    if (error instanceof ZodError) return { error: "Verifique datas, horas, campos e limites indicados." };
    return { error: "Não foi possível guardar. Verifique o seu acesso e atualize a página." };
  }
  revalidatePath(`/operator/${organizationId}/calendar`);
  redirect(`/operator/${organizationId}/calendar?date=${date}&saved=1`);
}
