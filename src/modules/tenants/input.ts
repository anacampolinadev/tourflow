import { z } from "zod";
import { operatorStatuses } from "./status";

const text = (max: number) => z.string().trim().min(1).max(max);
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const operatorInput = z.object({
  name: text(120),
  responsibleName: text(120),
  contactEmail: email,
  contactPhone: z.string().trim().min(6).max(30).regex(/^[+\d ()-]+$/),
  plan: z.enum(["FLEET", "MANAGED"]),
  setupPaid: z.boolean(),
  monthlyPriceCents: z.number().int().min(0).max(100_000_000),
  primaryLanguage: z.enum(["pt", "en", "es", "de"]),
}).strict();
export const createOperatorInput = operatorInput.extend({ slug: z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });
export const statusInput = z.enum(operatorStatuses);

export class OperatorConflict extends Error {
  constructor() { super("Os dados mudaram ou já existe um operador com este endereço. Atualize a página."); this.name = "OperatorConflict"; }
}

export function priceToCents(value: string): number {
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(value.trim())) throw new Error("Mensalidade inválida. Use no máximo duas casas decimais.");
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
