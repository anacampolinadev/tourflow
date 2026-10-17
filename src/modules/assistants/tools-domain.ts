import { z } from "zod";
import { availabilityInput } from "@/modules/availability";
import { supportedLanguages } from "@/types/languages";
export const toolNames = ["get_services", "get_service_details", "check_availability", "create_booking", "get_booking", "handoff_to_human"] as const;
export type ToolName = (typeof toolNames)[number];
const id = z.string().min(1).max(100);
const request = availabilityInput.extend({ language: z.enum(supportedLanguages) });
export const toolRequest = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("get_services"), input: z.object({ page: z.number().int().min(1).max(10000).default(1) }).strict() }).strict(),
  z.object({ tool: z.literal("get_service_details"), input: z.object({ serviceId: id }).strict() }).strict(),
  z.object({ tool: z.literal("check_availability"), input: request }).strict(),
  z.object({ tool: z.literal("create_booking"), input: request.extend({ serviceVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), customerName: z.string().trim().min(2).max(120), customerEmail: z.email().max(254).transform(value => value.toLowerCase()), customerPhone: z.string().trim().min(6).max(30).regex(/^[+()\d .-]+$/), pickup: z.string().trim().max(300).default("") }).strict() }).strict(),
  z.object({ tool: z.literal("get_booking"), input: z.object({ bookingId: id }).strict() }).strict(),
  z.object({ tool: z.literal("handoff_to_human"), input: z.object({ reason: z.string().trim().min(3).max(500).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) }).strict() }).strict(),
]);
export const toolContextId = z.uuid();
export class ToolError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
export type ServiceDetails = { version: number; id: string; name: string; description: string; durationMinutes: number; pricingType: "PER_PERSON" | "PER_GROUP"; basePriceCents: number; currency: string; capacity: number; meetingPoint: string; pickupAvailable: boolean; pickupRules: string; languages: string[] };
export type ServiceSummary = Pick<ServiceDetails, "id" | "version" | "name" | "basePriceCents" | "currency" | "pricingType" | "languages">;
export type BookingReceipt = { id: string; mode: string; status: string; statusLabel: string; serviceName: string; startsAt: string; endsAt: string; timeZone: string; passengers: number; totalPriceCents: number; currency: string; meetingPoint: string };
export type ToolResult = { success: boolean; mode: "SANDBOX"; message: string; code?: string; replayed?: boolean; services?: { items: ServiceSummary[]; page: number; total: number }; service?: ServiceDetails; availability?: { available: boolean; reason: string; checkedAt: string; timeZone: string; startsAt: string; endsAt: string; alternatives: Array<{ date: string; time: string; startsAt: string; endsAt: string }>; reservationConfirmed: false }; booking?: BookingReceipt; handoff?: { id: string; status: "OPEN"; notificationSent: false } };
export type ToolFormState = { result: ToolResult | null; error: string | null };
