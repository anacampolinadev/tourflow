import { Temporal } from "@js-temporal/polyfill";
import { AvailabilityError, availabilityInput, type AvailabilityReason, type Interval, covers, localToDate, minuteLabel, minuteOfDay, overlaps } from "./domain";
export type CalendarSchedule = { id: string; organizationId: string; serviceId: string; weekday: number; departureMinutes: number; validFrom: Date; validUntil: Date; bufferBeforeMinutes: number; bufferAfterMinutes: number; active: boolean };
export type CalendarSnapshot = {
  organizationId: string; timeZone: string; operatorStatus: string;
  service: { id: string; organizationId: string; active: boolean; durationMinutes: number; capacity: number; languages: string[] } | null;
  schedules: CalendarSchedule[];
  vehicles: Array<{ id: string; organizationId: string; name: string; active: boolean; capacity: number }>;
  drivers: Array<{ id: string; organizationId: string; name: string; status: string; languages: string[] }>;
  windows: Array<Interval & { organizationId: string; driverId: string; active: boolean }>;
  blocks: Array<Interval & { organizationId: string; driverId: string | null; vehicleId: string | null; active: boolean }>;
};
export type AvailabilityResult = { mode: "PLANNING"; available: boolean; reason: AvailabilityReason; checkedAt: string; timeZone: string; startsAt: string; endsAt: string; occupiedStartsAt: string; occupiedEndsAt: string; eligibleVehicles: Array<{ id: string; name: string }>; eligibleDrivers: Array<{ id: string; name: string }>; alternatives: Array<{ date: string; time: string; startsAt: string; endsAt: string }> };
function dateString(date: Date) { return date.toISOString().slice(0, 10); }
function matching(schedule: CalendarSchedule, serviceId: string, date: string, time: string) {
  return schedule.active && schedule.serviceId === serviceId && schedule.weekday === Temporal.PlainDate.from(date).dayOfWeek && schedule.departureMinutes === minuteOfDay(time) && dateString(schedule.validFrom) <= date && dateString(schedule.validUntil) >= date;
}
export function evaluateAvailability(snapshot: CalendarSnapshot, raw: unknown, now = new Date()): AvailabilityResult {
  const input = availabilityInput.parse(raw);
  const startsAt = localToDate(`${input.date}T${input.time}`, snapshot.timeZone);
  const service = snapshot.service;
  const schedules = snapshot.schedules.filter((row) => row.organizationId === snapshot.organizationId);
  const schedulesForService = schedules.filter((row) => row.serviceId === input.serviceId && row.active);
  const windowsByDriver = new Map<string, Interval[]>(), driverBlocks = new Map<string, Interval[]>(), vehicleBlocks = new Map<string, Interval[]>();
  for (const window of snapshot.windows) if (window.active && window.organizationId === snapshot.organizationId) windowsByDriver.set(window.driverId, [...(windowsByDriver.get(window.driverId) ?? []), window]);
  for (const block of snapshot.blocks) if (block.active && block.organizationId === snapshot.organizationId) {
    if (block.driverId) driverBlocks.set(block.driverId, [...(driverBlocks.get(block.driverId) ?? []), block]);
    if (block.vehicleId) vehicleBlocks.set(block.vehicleId, [...(vehicleBlocks.get(block.vehicleId) ?? []), block]);
  }
  function at(date: string, time: string): Omit<AvailabilityResult, "alternatives"> {
    const start = localToDate(`${date}T${time}`, snapshot.timeZone);
    const end = new Date(start.valueOf() + (service?.durationMinutes ?? 0) * 60000);
    const matchingSchedules = schedulesForService.filter((row) => matching(row, input.serviceId, date, time));
    const before = Math.max(0, ...matchingSchedules.map((row) => row.bufferBeforeMinutes)), after = Math.max(0, ...matchingSchedules.map((row) => row.bufferAfterMinutes));
    const occupied = { startsAt: new Date(start.valueOf() - before * 60000), endsAt: new Date(end.valueOf() + after * 60000) };
    const result: Omit<AvailabilityResult, "alternatives"> = { mode: "PLANNING", available: false, reason: "AVAILABLE", checkedAt: now.toISOString(), timeZone: snapshot.timeZone, startsAt: start.toISOString(), endsAt: end.toISOString(), occupiedStartsAt: occupied.startsAt.toISOString(), occupiedEndsAt: occupied.endsAt.toISOString(), eligibleVehicles: [], eligibleDrivers: [] };
    const deny = (reason: AvailabilityReason) => ({ ...result, reason });
    if (!["ONBOARDING", "DOCS_PENDING", "UNDER_REVIEW", "APPROVED", "GENERATING", "ASSISTANT_TRAINING", "SANDBOX", "CLIENT_REVIEW", "LIVE"].includes(snapshot.operatorStatus)) return deny("OPERATOR_UNAVAILABLE");
    if (!service || service.organizationId !== snapshot.organizationId || service.id !== input.serviceId || !service.active || !Number.isInteger(service.durationMinutes) || service.durationMinutes < 1 || service.durationMinutes > 1440) return deny("SERVICE_UNAVAILABLE");
    if (input.passengers > service.capacity) return deny("CAPACITY_EXCEEDED");
    if (input.language && !service.languages.includes(input.language)) return deny("LANGUAGE_UNSUPPORTED");
    if (occupied.startsAt <= now) return deny("PAST_TIME");
    if (start.valueOf() > now.valueOf() + 366 * 86400000) return deny("OUTSIDE_HORIZON");
    if (!matchingSchedules.length) return deny("OUTSIDE_SCHEDULE");
    const vehicles = snapshot.vehicles.filter((vehicle) => vehicle.organizationId === snapshot.organizationId && vehicle.active && vehicle.capacity >= input.passengers && !(vehicleBlocks.get(vehicle.id) ?? []).some((block) => overlaps(block, occupied))).map(({ id, name }) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id, "en"));
    if (!vehicles.length) return deny("NO_VEHICLE");
    const drivers = snapshot.drivers.filter((driver) => driver.organizationId === snapshot.organizationId && driver.status === "ACTIVE" && (!input.language || driver.languages.includes(input.language)) && covers(windowsByDriver.get(driver.id) ?? [], occupied) && !(driverBlocks.get(driver.id) ?? []).some((block) => overlaps(block, occupied))).map(({ id, name }) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id, "en"));
    if (!drivers.length) return deny("NO_DRIVER");
    return { ...result, available: true, reason: "AVAILABLE", eligibleVehicles: vehicles, eligibleDrivers: drivers };
  }
  const result = at(input.date, input.time);
  const alternatives: AvailabilityResult["alternatives"] = [];
  if (!result.available && !["OPERATOR_UNAVAILABLE", "SERVICE_UNAVAILABLE", "CAPACITY_EXCEEDED", "LANGUAGE_UNSUPPORTED", "OUTSIDE_HORIZON"].includes(result.reason)) {
    const seen = new Set<string>();
    for (let day = 0; day <= 7 && alternatives.length < 3; day++) {
      const date = Temporal.PlainDate.from(input.date).add({ days: day }).toString();
      for (const schedule of [...schedulesForService].sort((a, b) => a.departureMinutes - b.departureMinutes)) {
        const time = minuteLabel(schedule.departureMinutes), key = `${date}T${time}`;
        if (seen.has(key) || !matching(schedule, input.serviceId, date, time)) continue;
        seen.add(key);
        try {
          if (localToDate(key, snapshot.timeZone) <= startsAt) continue;
          const candidate = at(date, time);
          if (candidate.available) alternatives.push({ date, time, startsAt: candidate.startsAt, endsAt: candidate.endsAt });
        } catch (error) { if (!(error instanceof AvailabilityError)) throw error; }
        if (alternatives.length === 3) break;
      }
    }
  }
  return { ...result, alternatives };
}
