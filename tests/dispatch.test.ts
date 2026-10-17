import { describe, expect, it } from "vitest";
import { assertDispatchable, dispatchInput, rankCandidates, scoreCandidate } from "../src/modules/dispatch/domain";
describe("Fair Dispatch v1", () => {
  it("prefers lower assigned workload and a vehicle with less wasted capacity", () => {
    const result = rankCandidates([{ id: "busy", assignments: 3 }, { id: "free", assignments: 0 }], [{ id: "large", capacity: 8 }, { id: "fit", capacity: 4 }], 4, true);
    expect(result[0]).toMatchObject({ driverId: "free", vehicleId: "fit", score: 8250 });
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
  });
  it("breaks ties deterministically regardless of input order", () => {
    const drivers = [{ id: "b", assignments: 0 }, { id: "a", assignments: 0 }], vehicles = [{ id: "v-b", capacity: 4 }, { id: "v-a", capacity: 4 }];
    expect(rankCandidates(drivers, vehicles, 4, true)).toEqual(rankCandidates([...drivers].reverse(), [...vehicles].reverse(), 4, true));
    expect(rankCandidates(drivers, vehicles, 4, true)[0]).toMatchObject({ driverId: "a", vehicleId: "v-a" });
  });
  it("keeps missing observations neutral and distinguishes language preference", () => {
    const preferred = scoreCandidate({ id: "d", assignments: 0 }, { id: "v", capacity: 4 }, 4, true);
    const neutral = scoreCandidate({ id: "d", assignments: 0 }, { id: "v", capacity: 4 }, 4, false);
    expect(preferred.factors).toMatchObject({ proximity: 5000, rating: 5000, acceptance: 5000, availability: 10000 });
    expect(preferred.score - neutral.score).toBe(250);
  });
  it("has no recommendation without both driver and vehicle and rejects invalid capacity", () => {
    expect(rankCandidates([], [{ id: "v", capacity: 4 }], 4, true)).toEqual([]);
    expect(rankCandidates([{ id: "d", assignments: 0 }], [], 4, true)).toEqual([]);
    expect(() => scoreCandidate({ id: "d", assignments: 0 }, { id: "v", capacity: 2 }, 4, true)).toThrow();
  });
  it("requires a reason for manual choice and rejects caller-defined scores or tenant", () => {
    const auto = { mode: "AUTO", expectedVersion: 0, idempotencyKey: "546f4946-499b-4edb-b8a5-79441650c645" };
    expect(dispatchInput.safeParse(auto).success).toBe(true);
    for (const extra of [{ score: 10000 }, { organizationId: "other" }, { driverId: "d" }]) expect(dispatchInput.safeParse({ ...auto, ...extra }).success).toBe(false);
    expect(dispatchInput.safeParse({ ...auto, mode: "MANUAL", driverId: "d", vehicleId: "v", reason: "" }).success).toBe(false);
  });
  it("allows only confirmed or assigned bookings to enter dispatch", () => {
    expect(() => assertDispatchable("CONFIRMED")).not.toThrow(); expect(() => assertDispatchable("ASSIGNED")).not.toThrow();
    for (const status of ["CANCELLED", "COMPLETED", "DRIVER_ACCEPTED"]) expect(() => assertDispatchable(status)).toThrow();
  });
});
