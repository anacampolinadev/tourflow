import { describe, expect, it } from "vitest";
import { availabilityInput, dayInterval, intervalFromLocal, localToDate, overlaps, covers, scheduleInput, timeZoneInput } from "../src/modules/availability/domain";
import { evaluateAvailability, type CalendarSnapshot } from "../src/modules/availability/engine";
const now = new Date("2026-11-01T12:00:00Z");
const query = { serviceId: "service", date: "2026-11-02", time: "10:00", passengers: 4, language: "en" };
const interval = (start: string, end: string) => ({ startsAt: new Date(start), endsAt: new Date(end) });
function snapshot(): CalendarSnapshot {
  return { organizationId: "org", timeZone: "Europe/Lisbon", operatorStatus: "ONBOARDING", service: { id: "service", organizationId: "org", active: true, durationMinutes: 120, capacity: 6, languages: ["pt", "en"] }, schedules: [600, 840].map((departureMinutes) => ({ id: String(departureMinutes), organizationId: "org", serviceId: "service", weekday: 1, departureMinutes, validFrom: new Date("2026-11-01"), validUntil: new Date("2026-11-30"), bufferBeforeMinutes: 15, bufferAfterMinutes: 15, active: true })), vehicles: [{ id: "vehicle", organizationId: "org", name: "Jipe", active: true, capacity: 6 }], drivers: [{ id: "driver", organizationId: "org", name: "João", status: "ACTIVE", languages: ["pt", "en"] }], windows: [{ organizationId: "org", driverId: "driver", active: true, ...interval("2026-11-02T08:00Z", "2026-11-02T18:00Z") }], blocks: [] };
}
describe("local times and half-open intervals", () => {
  it("converts summer and winter using the configured zone rather than the host zone", () => {
    expect(localToDate("2026-07-10T10:00", "Europe/Lisbon").toISOString()).toBe("2026-07-10T09:00:00.000Z");
    expect(localToDate("2026-12-10T10:00", "Europe/Lisbon").toISOString()).toBe("2026-12-10T10:00:00.000Z");
  });
  it("rejects nonexistent and repeated local hours at DST transitions", () => {
    expect(() => localToDate("2026-03-29T01:30", "Europe/Lisbon")).toThrow("ambígua");
    expect(() => localToDate("2026-10-25T01:30", "Europe/Lisbon")).toThrow("ambígua");
    expect(timeZoneInput.safeParse("Unknown/City").success).toBe(false);
    expect(timeZoneInput.safeParse("+01:00").success).toBe(false);
  });
  it("uses 23-hour and 25-hour local day boundaries", () => {
    const spring = dayInterval("2026-03-29", "Europe/Lisbon"), autumn = dayInterval("2026-10-25", "Europe/Lisbon");
    expect(spring.endsAt.valueOf() - spring.startsAt.valueOf()).toBe(23 * 3600000);
    expect(autumn.endsAt.valueOf() - autumn.startsAt.valueOf()).toBe(25 * 3600000);
  });
  it("permits overnight windows while rejecting reversed, empty and excessive ranges", () => {
    expect(intervalFromLocal("2026-11-02T23:00", "2026-11-03T03:00", "Europe/Lisbon").endsAt.toISOString()).toBe("2026-11-03T03:00:00.000Z");
    for (const end of ["2026-11-02T22:00", "2026-11-02T23:00", "2027-01-01T03:00"]) expect(() => intervalFromLocal("2026-11-02T23:00", end, "UTC")).toThrow();
  });
  it("accepts touching boundaries, merges adjacent windows and detects a one-millisecond gap", () => {
    const needed = interval("2026-11-02T10:00Z", "2026-11-02T12:00Z");
    expect(overlaps(needed, interval("2026-11-02T12:00Z", "2026-11-02T13:00Z"))).toBe(false);
    expect(covers([interval("2026-11-02T09:00Z", "2026-11-02T11:00Z"), interval("2026-11-02T11:00Z", "2026-11-02T13:00Z")], needed)).toBe(true);
    expect(covers([interval("2026-11-02T09:00Z", "2026-11-02T11:00Z"), interval("2026-11-02T11:00:00.001Z", "2026-11-02T13:00Z")], needed)).toBe(false);
  });
  it("validates calendar dates, weekdays, buffers and payload scope", () => {
    expect(availabilityInput.safeParse({ ...query, date: "2026-02-30" }).success).toBe(false);
    expect(availabilityInput.safeParse({ ...query, passengers: 1.5 }).success).toBe(false);
    expect(availabilityInput.safeParse({ ...query, organizationId: "other" }).success).toBe(false);
    expect(scheduleInput.safeParse({ serviceId: "service", weekday: 8, time: "10:00", validFrom: "2026-11-01", validUntil: "2026-12-01", bufferBeforeMinutes: 0, bufferAfterMinutes: 0 }).success).toBe(false);
  });
});
describe("deterministic calendar availability", () => {
  it("returns all free candidates with exact service and buffered intervals, without assigning", () => {
    const data = snapshot(), before = JSON.stringify(data);
    const result = evaluateAvailability(data, query, now);
    expect(result).toMatchObject({ mode: "PLANNING", available: true, startsAt: "2026-11-02T10:00:00.000Z", endsAt: "2026-11-02T12:00:00.000Z", occupiedStartsAt: "2026-11-02T09:45:00.000Z", occupiedEndsAt: "2026-11-02T12:15:00.000Z", eligibleVehicles: [{ id: "vehicle", name: "Jipe" }], eligibleDrivers: [{ id: "driver", name: "João" }] });
    expect(JSON.stringify(data)).toBe(before);
    expect(evaluateAvailability(data, query, now)).toEqual(result);
  });
  it("requires an active service and an allowed operator state", () => {
    expect(evaluateAvailability({ ...snapshot(), operatorStatus: "SUSPENDED" }, query, now).reason).toBe("OPERATOR_UNAVAILABLE");
    const data = snapshot(); data.service!.active = false;
    expect(evaluateAvailability(data, query, now).reason).toBe("SERVICE_UNAVAILABLE");
  });
  it("enforces service capacity and requested language before resource selection", () => {
    expect(evaluateAvailability(snapshot(), { ...query, passengers: 7 }, now).reason).toBe("CAPACITY_EXCEEDED");
    expect(evaluateAvailability(snapshot(), { ...query, language: "de" }, now).reason).toBe("LANGUAGE_UNSUPPORTED");
  });
  it("requires a matching weekly departure and inclusive date range", () => {
    expect(evaluateAvailability(snapshot(), { ...query, time: "10:01" }, now).reason).toBe("OUTSIDE_SCHEDULE");
    const data = snapshot(); data.schedules.forEach((row) => { row.validUntil = new Date("2026-11-01"); });
    expect(evaluateAvailability(data, query, now).reason).toBe("OUTSIDE_SCHEDULE");
  });
  it("rejects past and beyond-horizon requests", () => {
    expect(evaluateAvailability(snapshot(), query, new Date("2026-11-02T10:00Z")).reason).toBe("PAST_TIME");
    expect(evaluateAvailability(snapshot(), query, new Date("2026-11-02T09:50Z")).reason).toBe("PAST_TIME");
    expect(evaluateAvailability(snapshot(), query, new Date("2025-01-01")).reason).toBe("OUTSIDE_HORIZON");
  });
  it("excludes inactive, undersized or unassociated vehicles", () => {
    const data = snapshot(); data.vehicles[0]!.capacity = 3;
    expect(evaluateAvailability(data, query, now).reason).toBe("NO_VEHICLE");
    data.vehicles[0]!.capacity = 6; data.vehicles[0]!.active = false;
    expect(evaluateAvailability(data, query, now).reason).toBe("NO_VEHICLE");
    expect(evaluateAvailability({ ...snapshot(), vehicles: [] }, query, now).reason).toBe("NO_VEHICLE");
  });
  it("excludes drivers without active state, language or complete buffered coverage", () => {
    const data = snapshot(); data.drivers[0]!.status = "PENDING";
    expect(evaluateAvailability(data, query, now).reason).toBe("NO_DRIVER");
    data.drivers[0]!.status = "ACTIVE"; data.drivers[0]!.languages = ["pt"];
    expect(evaluateAvailability(data, query, now).reason).toBe("NO_DRIVER");
    data.drivers[0]!.languages = ["en"]; data.windows[0]!.startsAt = new Date("2026-11-02T10:00Z");
    expect(evaluateAvailability(data, query, now).reason).toBe("NO_DRIVER");
  });
  it("blocks the whole buffered interval and gives chronologically available alternatives", () => {
    const data = snapshot(); data.blocks.push({ organizationId: "org", vehicleId: "vehicle", driverId: null, active: true, ...interval("2026-11-02T09:50Z", "2026-11-02T10:00Z") });
    expect(evaluateAvailability(data, query, now)).toMatchObject({ available: false, reason: "NO_VEHICLE", eligibleVehicles: [], eligibleDrivers: [], alternatives: [{ date: "2026-11-02", time: "14:00", startsAt: "2026-11-02T14:00:00.000Z", endsAt: "2026-11-02T16:00:00.000Z" }] });
    data.blocks[0]!.startsAt = new Date("2026-11-02T12:15Z"); data.blocks[0]!.endsAt = new Date("2026-11-02T13:00Z");
    expect(evaluateAvailability(data, query, now).available).toBe(true);
  });
  it("honors driver blocks and ignores cancelled entries", () => {
    const data = snapshot(); data.blocks.push({ organizationId: "org", vehicleId: null, driverId: "driver", active: true, ...interval("2026-11-02T10:00Z", "2026-11-02T11:00Z") });
    expect(evaluateAvailability(data, query, now).reason).toBe("NO_DRIVER");
    data.blocks[0]!.active = false;
    expect(evaluateAvailability(data, query, now).available).toBe(true);
    data.windows[0]!.active = false;
    expect(evaluateAvailability(data, query, now).reason).toBe("NO_DRIVER");
  });
  it("fails closed for cross-tenant records even if a snapshot was assembled incorrectly", () => {
    const data = snapshot(); data.vehicles[0]!.organizationId = "other";
    expect(evaluateAvailability(data, query, now).reason).toBe("NO_VEHICLE");
    const drivers = snapshot(); drivers.windows[0]!.organizationId = "other";
    expect(evaluateAvailability(drivers, query, now).reason).toBe("NO_DRIVER");
    const schedules = snapshot(); schedules.schedules[0]!.organizationId = "other";
    expect(evaluateAvailability(schedules, query, now).reason).toBe("OUTSIDE_SCHEDULE");
    expect(evaluateAvailability(snapshot(), { ...query, serviceId: "foreign" }, now).reason).toBe("SERVICE_UNAVAILABLE");
  });
  it("handles overnight service duration and stable candidate ordering", () => {
    const data = snapshot(); data.schedules = [{ ...data.schedules[0]!, departureMinutes: 1410, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 }];
    data.windows = [{ ...data.windows[0]!, ...interval("2026-11-02T22:00Z", "2026-11-03T04:00Z") }];
    data.vehicles.push({ ...data.vehicles[0]!, id: "aaa", name: "Outro jipe" });
    const result = evaluateAvailability(data, { ...query, time: "23:30" }, now);
    expect(result.endsAt).toBe("2026-11-03T01:30:00.000Z");
    expect(result.eligibleVehicles.map((row) => row.id)).toEqual(["aaa", "vehicle"]);
  });
});
