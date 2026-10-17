import { z } from "zod";

export class DriverPortalError extends Error {
  constructor(message: string) { super(message); this.name = "DriverPortalError"; }
}
export const driverCommand = z.object({
  type: z.enum(["ACCEPT", "DECLINE", "ARRIVE", "START", "COMPLETE"]),
  expectedVersion: z.number().int().min(0), idempotencyKey: z.string().uuid(),
}).strict();
export type DriverCommandType = z.infer<typeof driverCommand>["type"];
export const driverCommandLabels: Record<DriverCommandType, string> = {
  ACCEPT: "Aceitar serviço", DECLINE: "Recusar serviço", ARRIVE: "Cheguei ao encontro", START: "Passageiros a bordo — iniciar", COMPLETE: "Concluir serviço",
};
export function driverTransition(status: string, type: DriverCommandType, startsAt: Date, endsAt: Date, now: Date) {
  const transitions = { ACCEPT: ["ASSIGNED", "DRIVER_ACCEPTED"], DECLINE: ["ASSIGNED", "DRIVER_DECLINED"], ARRIVE: ["DRIVER_ACCEPTED", "ARRIVED"], START: ["ARRIVED", "IN_PROGRESS"], COMPLETE: ["IN_PROGRESS", "COMPLETED"] } as const;
  const [from, to] = transitions[type];
  if (status !== from) throw new DriverPortalError("O serviço mudou ou esta etapa não está disponível. Atualize a página.");
  if (type !== "COMPLETE" && now >= endsAt) throw new DriverPortalError("O horário do serviço terminou. Contacte o operador.");
  if (type === "ARRIVE" && now.valueOf() < startsAt.valueOf() - 2 * 3600000) throw new DriverPortalError("Pode indicar chegada nas duas horas anteriores à saída.");
  if (type === "START" && now < startsAt) throw new DriverPortalError("Aguarde a hora de saída para iniciar.");
  return to;
}
