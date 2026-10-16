import { z } from "zod";
export const vehicleTypes = ["JEEP", "CAR", "VAN", "MINIBUS", "BUS"] as const;
export const vehicleLabels = { JEEP: "Jipe", CAR: "Automóvel", VAN: "Carrinha", MINIBUS: "Minibus", BUS: "Autocarro" };
export const vehicleInput = z.object({
  name: z.string().trim().min(3).max(120), type: z.enum(vehicleTypes),
  registration: z.string().trim().toUpperCase().min(4).max(20).regex(/^[A-Z0-9 -]+$/).transform((value) => value.replace(/[ -]/g, "")).pipe(z.string().min(4).max(16)),
  capacity: z.number().int().min(1).max(100),
  features: z.array(z.string().trim().min(1).max(60)).max(10).refine((values) => new Set(values.map((value) => value.toLowerCase())).size === values.length),
  active: z.boolean(),
}).strict();
