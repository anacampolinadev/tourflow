import { z } from "zod";
import { availabilityInput } from "@/modules/availability";

export class BookingError extends Error {
  constructor(message: string) { super(message); this.name = "BookingError"; }
}
export const bookingListInput = z.object({ date: availabilityInput.shape.date.optional(), search: z.string().trim().max(120).default(""), status: z.enum(["ALL", "PENDING_ASSIGNMENT", "ASSIGNED_GROUP", "CONFIRMED", "ASSIGNED", "DRIVER_ACCEPTED", "DRIVER_DECLINED", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).default("ALL") }).strict();
export const bookingInput = availabilityInput.extend({
  idempotencyKey: z.string().uuid(),
  customerName: z.string().trim().min(2).max(120),
  customerEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  customerPhone: z.string().trim().min(6).max(30).regex(/^[+()\d .-]+$/),
  pickup: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(1000).default(""),
  source: z.enum(["OPERATOR", "PHONE", "EMAIL", "ASSISTANT_SANDBOX"]).default("OPERATOR"),
}).strict();
export function bookingPrice(pricingType: "PER_PERSON" | "PER_GROUP", unitPriceCents: number, passengers: number) {
  const total = unitPriceCents * (pricingType === "PER_PERSON" ? passengers : 1);
  if (!Number.isSafeInteger(total) || total < 0 || total > 2_147_483_647) throw new BookingError("O total excede o limite permitido.");
  return total;
}
export function assertCancellable(status: string) {
  if (status !== "CONFIRMED" && status !== "ASSIGNED" && status !== "DRIVER_ACCEPTED" && status !== "DRIVER_DECLINED" && status !== "ARRIVED" && status !== "CANCELLED") throw new BookingError("Esta reserva não pode ser cancelada neste estado.");
}

export const bookingLabels = { CONFIRMED: "Confirmada em teste", ASSIGNED: "Atribuída em teste", DRIVER_ACCEPTED: "Aceite em teste", DRIVER_DECLINED: "Recusada — redistribuir", ARRIVED: "No encontro em teste", IN_PROGRESS: "Em curso em teste", COMPLETED: "Concluída em teste", CANCELLED: "Cancelada" };
