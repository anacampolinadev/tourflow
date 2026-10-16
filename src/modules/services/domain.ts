import { z } from "zod";
import { supportedLanguages } from "@/types/languages";
export const pricingTypes = ["PER_PERSON", "PER_GROUP"] as const;
export const pricingLabels = { PER_PERSON: "Por pessoa", PER_GROUP: "Por grupo" };
export const serviceInput = z.object({
  name: z.string().trim().min(3).max(120), description: z.string().trim().max(2000),
  durationMinutes: z.number().int().min(1).max(1440), pricingType: z.enum(pricingTypes),
  basePriceCents: z.number().int().min(0).max(100_000_000), currency: z.literal("EUR"),
  capacity: z.number().int().min(1).max(100), meetingPoint: z.string().trim().min(3).max(300),
  pickupAvailable: z.boolean(), pickupRules: z.string().trim().max(1000),
  languages: z.array(z.enum(supportedLanguages)).min(1).max(4).refine((values) => new Set(values).size === values.length), active: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.pickupAvailable && value.pickupRules.length < 3) context.addIssue({ code: "custom", path: ["pickupRules"], message: "Indique as regras de recolha." });
  if (!value.pickupAvailable && value.pickupRules) context.addIssue({ code: "custom", path: ["pickupRules"], message: "Desative ou remova as regras de recolha." });
});
export function servicePriceToCents(value: string) {
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(value.trim())) throw new Error("Indique um preço válido com até duas casas decimais.");
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  return z.number().int().max(100_000_000).parse(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
}
