import { z } from "zod";
export const handoffStatuses = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export type HandoffStatus = typeof handoffStatuses[number];
export const handoffLabels: Record<HandoffStatus, string> = { OPEN: "Por assumir", IN_PROGRESS: "Em atendimento", RESOLVED: "Concluído" };
export const handoffInput = z.object({
  expectedVersion: z.number().int().min(0).max(99),
  action: z.enum(["CLAIM", "RELEASE", "RESOLVE", "REOPEN"]),
  note: z.string().trim().max(1000).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)).default(""),
}).strict().superRefine((input, ctx) => {
  if (input.action === "RESOLVE" && [...input.note].length < 10) ctx.addIssue({ code: "custom", path: ["note"], message: "Descreva a resolução (10–1000 caracteres)." });
  if (input.action !== "RESOLVE" && input.note !== "") ctx.addIssue({ code: "custom", path: ["note"], message: "Esta ação não recebe nota." });
});
export const queueInput = z.object({ status: z.enum(handoffStatuses).default("OPEN"), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
export class ManagedOpsError extends Error {}
export function nextHandoffState(status: string, assignedToId: string | null, actorId: string, admin: boolean, action: z.infer<typeof handoffInput>["action"]): HandoffStatus {
  if (action === "CLAIM" && status === "OPEN") return "IN_PROGRESS";
  if (action === "RELEASE" && status === "IN_PROGRESS" && (assignedToId === actorId || admin)) return "OPEN";
  if (action === "RESOLVE" && status === "IN_PROGRESS" && assignedToId === actorId) return "RESOLVED";
  if (action === "REOPEN" && status === "RESOLVED") return "OPEN";
  throw new ManagedOpsError("Ação indisponível. Atualize a página e confira quem assumiu o atendimento.");
}
// DATE is inclusive in UTC, matching the compliance gate. Seven-day warning includes today + 7.
export function documentHealth(status: string | undefined, expiresOn: Date | null | undefined, now: Date, requiresExpiry: boolean) {
  if (status !== "APPROVED" || (requiresExpiry && !expiresOn)) return "BLOCKED";
  if (!expiresOn) return "OK";
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = (expiresOn.valueOf() - today) / 86400000;
  return days < 0 ? "BLOCKED" : days <= 7 ? "EXPIRING" : "OK";
}
