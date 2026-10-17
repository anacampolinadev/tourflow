import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { try { return Temporal.PlainDate.from(value).toString() === value; } catch { return false; } });
export const listInput = z.object({ search: z.string().trim().max(120).default(""), page: z.number().int().min(1).max(10000).default(1) }).strict();
export const dashboardInput = z.object({ date: date.optional(), page: z.number().int().min(1).max(10000).default(1) }).strict();
export const reportInput = z.object({ from: date, until: date }).strict().refine((value) => { try { return value.until >= value.from && Temporal.PlainDate.from(value.from).until(Temporal.PlainDate.from(value.until)).days < 31; } catch { return false; } }, "Escolha um período de até 31 dias.");
export function todayInZone(timeZone: string, now = new Date()) { return Temporal.Instant.fromEpochMilliseconds(now.valueOf()).toZonedDateTimeISO(timeZone).toPlainDate().toString(); }
export function dateOffset(value: string, days: number) { return Temporal.PlainDate.from(value).add({ days }).toString(); }
export function periodBounds(from: string, until: string, timeZone: string) {
  reportInput.parse({ from, until });
  return { startsAt: new Date(Temporal.PlainDate.from(from).toZonedDateTime(timeZone).epochMilliseconds), endsAt: new Date(Temporal.PlainDate.from(until).add({ days: 1 }).toZonedDateTime(timeZone).epochMilliseconds) };
}
