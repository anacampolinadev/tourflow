import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { assertCancellable, bookingInput, bookingPrice } from "../src/modules/bookings/domain";
describe("booking contracts", () => {
  it("calculates per-person and whole-group prices in integer cents, rejecting overflow", () => {
    expect(bookingPrice("PER_PERSON", 4990, 4)).toBe(19960);
    expect(bookingPrice("PER_GROUP", 4990, 4)).toBe(4990);
    expect(() => bookingPrice("PER_PERSON", 100_000_000, 100)).toThrow("limite");
  });
  it("accepts only the implemented cancellation transitions", () => {
    expect(() => assertCancellable("CONFIRMED")).not.toThrow();
    expect(() => assertCancellable("CANCELLED")).not.toThrow();
    for (const state of ["COMPLETED", "IN_PROGRESS", "UNKNOWN"]) expect(() => assertCancellable(state)).toThrow();
  });
  it("rejects caller-controlled prices, state, mode, resource assignments and tenant", () => {
    const input = { serviceId: "service", date: "2027-01-10", time: "10:00", passengers: 4, idempotencyKey: "546f4946-499b-4edb-b8a5-79441650c645", customerName: "Test Customer", customerEmail: "TEST@example.test", customerPhone: "+351912345678" };
    expect(bookingInput.parse(input).customerEmail).toBe("test@example.test");
    for (const key of ["price", "status", "mode", "driverId", "vehicleId", "organizationId"]) expect(bookingInput.safeParse({ ...input, [key]: "untrusted" }).success).toBe(false);
    expect(bookingInput.safeParse({ ...input, passengers: 0 }).success).toBe(false);
    expect(bookingInput.safeParse({ ...input, date: "2027-02-30" }).success).toBe(false);
  });
});
