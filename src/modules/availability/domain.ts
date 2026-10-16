import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { supportedLanguages } from "@/types/languages";
export class AvailabilityError extends Error { constructor(message: string) { super(message); this.name = "AvailabilityError"; } }
export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { try { return Temporal.PlainDate.from(value).toString() === value; } catch { return false; } }, "Data inválida.");
export const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).refine((value) => { try { return Temporal.PlainDateTime.from(value).toString({ smallestUnit: "minute" }) === value; } catch { return false; } });
export const timeZoneInput = z.string().min(1).max(100).refine((value) => { try { return !/^[+-]/.test(value) && Boolean(new Intl.DateTimeFormat("en", { timeZone: value })); } catch { return false; } }, "Fuso horário IANA inválido.");
const id = z.string().min(1).max(100);
export const availabilityInput = z.object({ serviceId: id, date: localDate, time: localTime, passengers: z.number().int().min(1).max(100), language: z.enum(supportedLanguages).optional() }).strict();
export const scheduleInput = z.object({ serviceId: id, weekday: z.number().int().min(1).max(7), time: localTime, validFrom: localDate, validUntil: localDate, bufferBeforeMinutes: z.number().int().min(0).max(240), bufferAfterMinutes: z.number().int().min(0).max(240) }).strict().refine((value) => value.validUntil >= value.validFrom && Temporal.PlainDate.from(value.validFrom).until(value.validUntil).days <= 366, "Período máximo de 366 dias e datas ordenadas.");
export const driverWindowInput = z.object({ driverId: id, startLocal: localDateTime, endLocal: localDateTime }).strict();
export const blockInput = z.object({ resourceType: z.enum(["vehicle", "driver"]), resourceId: id, startLocal: localDateTime, endLocal: localDateTime, reason: z.string().trim().min(3).max(200) }).strict();
export const linkInput = z.object({ serviceId: id, vehicleId: id }).strict();
export const MAX_CALENDAR_ENTRIES = 500;
export function dateOnly(value: string) { return new Date(`${localDate.parse(value)}T00:00:00.000Z`); }
export function minuteOfDay(value: string) { const [hour, minute] = localTime.parse(value).split(":").map(Number); return hour! * 60 + minute!; }
export function minuteLabel(value: number) { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
export function localToDate(value: string, timeZone: string): Date {
  localDateTime.parse(value); timeZoneInput.parse(timeZone);
  try { return new Date(Temporal.PlainDateTime.from(value).toZonedDateTime(timeZone, { disambiguation: "reject" }).epochMilliseconds); }
  catch { throw new AvailabilityError("Hora inexistente ou ambígua na mudança da hora. Escolha outro horário."); }
}
export function localLabel(value: Date, timeZone: string) { return Temporal.Instant.fromEpochMilliseconds(value.valueOf()).toZonedDateTimeISO(timeZone).toPlainDateTime().toString({ smallestUnit: "minute" }); }
export function tomorrowLocalDate(timeZone: string, now = new Date()) { return Temporal.Instant.fromEpochMilliseconds(now.valueOf()).toZonedDateTimeISO(timeZone).toPlainDate().add({ days: 1 }).toString(); }
export function dayInterval(date: string, timeZone: string) {
  const day = Temporal.PlainDate.from(localDate.parse(date));
  return { startsAt: new Date(day.toZonedDateTime(timeZone).epochMilliseconds), endsAt: new Date(day.add({ days: 1 }).toZonedDateTime(timeZone).epochMilliseconds) };
}
export function intervalFromLocal(start: string, end: string, timeZone: string) {
  const startsAt = localToDate(start, timeZone), endsAt = localToDate(end, timeZone);
  if (endsAt <= startsAt || endsAt.valueOf() - startsAt.valueOf() > 31 * 86400000) throw new AvailabilityError("O fim deve ser posterior ao início; máximo de 31 dias por intervalo.");
  return { startsAt, endsAt };
}
export type Interval = { startsAt: Date; endsAt: Date };
export function overlaps(a: Interval, b: Interval) { return a.startsAt < b.endsAt && b.startsAt < a.endsAt; }
export function covers(windows: Interval[], needed: Interval) {
  let covered = needed.startsAt.valueOf();
  for (const window of [...windows].sort((a, b) => a.startsAt.valueOf() - b.startsAt.valueOf())) {
    if (window.startsAt.valueOf() > covered) break;
    if (window.endsAt.valueOf() > covered) covered = window.endsAt.valueOf();
    if (covered >= needed.endsAt.valueOf()) return true;
  }
  return false;
}
export const availabilityReasons = { AVAILABLE: "Há recursos livres na agenda.", OPERATOR_UNAVAILABLE: "Operador indisponível para planeamento.", SERVICE_UNAVAILABLE: "Serviço inexistente ou inativo.", CAPACITY_EXCEEDED: "O grupo excede a capacidade do serviço.", LANGUAGE_UNSUPPORTED: "O serviço não oferece o idioma pedido.", PAST_TIME: "Escolha um horário futuro.", OUTSIDE_HORIZON: "Consulte até 366 dias no futuro.", OUTSIDE_SCHEDULE: "Não existe saída prevista para esse horário.", NO_VEHICLE: "Sem veículo compatível com capacidade e agenda livres.", NO_DRIVER: "Sem motorista ativo com idioma e janela livres." };
export type AvailabilityReason = keyof typeof availabilityReasons;
