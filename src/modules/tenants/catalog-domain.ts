import { z } from "zod";
import type { OperatorStatus } from "./status";
export class CatalogConflict extends Error {
  constructor(message = "Os dados mudaram, não existem neste operador ou há um identificador duplicado. Atualize a página.") { super(message); this.name = "CatalogConflict"; }
}
export class CatalogUnavailable extends Error {
  constructor() { super("O cadastro está bloqueado no estado atual do operador."); this.name = "CatalogUnavailable"; }
}
export const catalogQuery = z.object({ search: z.string().trim().max(120).default(""), page: z.number().int().min(1).max(10000).default(1), active: z.enum(["all", "active", "inactive"]).default("all") }).strict();
export const recordVersion = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export function assertCatalogWritable(status: OperatorStatus): void {
  if (["LEAD", "CONTRACTED", "RESTRICTED", "SUSPENDED"].includes(status)) throw new CatalogUnavailable();
}
