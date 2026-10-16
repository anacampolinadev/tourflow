import { z } from "zod";
import { supportedLanguages } from "@/types/languages";
export const driverStatuses = ["INVITED", "PENDING", "ACTIVE", "INACTIVE", "SUSPENDED"] as const;
export type DriverStatus = (typeof driverStatuses)[number];
export const driverLabels: Record<DriverStatus, string> = { INVITED: "Convidado", PENDING: "Pendente", ACTIVE: "Ativo", INACTIVE: "Inativo", SUSPENDED: "Suspenso" };
export const driverInput = z.object({
  name: z.string().trim().min(3).max(120), phone: z.string().trim().min(6).max(30).regex(/^[+\d ()-]+$/),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  languages: z.array(z.enum(supportedLanguages)).min(1).max(4).refine((values) => new Set(values).size === values.length),
}).strict();
const transitions: Record<DriverStatus, readonly DriverStatus[]> = {
  INVITED: ["PENDING", "SUSPENDED"], PENDING: ["ACTIVE", "INACTIVE", "SUSPENDED"], ACTIVE: ["INACTIVE", "SUSPENDED"], INACTIVE: ["PENDING", "ACTIVE", "SUSPENDED"], SUSPENDED: ["PENDING"],
};
export class InvalidDriverTransition extends Error { constructor() { super("Esta alteração de estado do motorista não é permitida."); this.name = "InvalidDriverTransition"; } }
export function allowedDriverStatuses(status: DriverStatus) { return transitions[status]; }
export function transitionDriver(from: DriverStatus, raw: unknown) {
  const next = z.enum(driverStatuses).parse(raw);
  if (!transitions[from].includes(next)) throw new InvalidDriverTransition();
  return next;
}
