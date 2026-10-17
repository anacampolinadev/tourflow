import { describe, expect, it } from "vitest";
import { driverCommand, driverTransition } from "../src/modules/drivers/portal-domain";
const start = new Date("2030-10-01T10:00Z"), end = new Date("2030-10-01T12:00Z");
describe("driver journey", () => {
  it("requires each preceding stage and rejects arbitrary client fields", () => {
    expect(() => driverTransition("CONFIRMED", "ACCEPT", start, end, start)).toThrow();
    expect(() => driverTransition("DRIVER_ACCEPTED", "COMPLETE", start, end, start)).toThrow();
    expect(() => driverTransition("COMPLETED", "START", start, end, start)).toThrow();
    expect(driverCommand.safeParse({ type: "ACCEPT", expectedVersion: 0, idempotencyKey: crypto.randomUUID(), driverId: "forged" }).success).toBe(false);
  });
  it("enforces arrival and start times with an exclusive end boundary", () => {
    expect(() => driverTransition("DRIVER_ACCEPTED", "ARRIVE", start, end, new Date("2030-10-01T07:59Z"))).toThrow();
    expect(driverTransition("DRIVER_ACCEPTED", "ARRIVE", start, end, new Date("2030-10-01T08:00Z"))).toBe("ARRIVED");
    expect(() => driverTransition("ARRIVED", "START", start, end, new Date("2030-10-01T09:59Z"))).toThrow();
    expect(driverTransition("ARRIVED", "START", start, end, start)).toBe("IN_PROGRESS");
    expect(() => driverTransition("ASSIGNED", "ACCEPT", start, end, end)).toThrow();
  });
  it("permits closure after the scheduled end and never skips acceptance", () => {
    expect(driverTransition("IN_PROGRESS", "COMPLETE", start, end, new Date("2030-10-02T10:00Z"))).toBe("COMPLETED");
    expect(driverTransition("ASSIGNED", "DECLINE", start, end, start)).toBe("DRIVER_DECLINED");
    expect(() => driverTransition("ASSIGNED", "START", start, end, start)).toThrow();
  });
});
