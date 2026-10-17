import { describe, expect, it } from "vitest";
import { documentHealth, handoffInput, nextHandoffState, queueInput } from "../src/modules/managed-ops/domain";
describe("Managed operation contracts", () => {
  it("warns at seven days and keeps the expiry date inclusive in UTC", () => {
    const now = new Date("2026-10-18T23:59:59Z");
    expect(documentHealth("APPROVED", new Date("2026-10-17Z"), now, true)).toBe("BLOCKED");
    expect(documentHealth("APPROVED", new Date("2026-10-18Z"), now, true)).toBe("EXPIRING");
    expect(documentHealth("APPROVED", new Date("2026-10-25Z"), now, true)).toBe("EXPIRING");
    expect(documentHealth("APPROVED", new Date("2026-10-26Z"), now, true)).toBe("OK");
    expect(documentHealth("APPROVED", null, now, true)).toBe("BLOCKED");
    expect(documentHealth("APPROVED", null, now, false)).toBe("OK");
    expect(documentHealth("REJECTED", null, now, false)).toBe("BLOCKED");
  });
  it("requires an explicit claim and prevents others from resolving even as admin", () => {
    expect(nextHandoffState("OPEN", null, "a", false, "CLAIM")).toBe("IN_PROGRESS");
    expect(() => nextHandoffState("OPEN", null, "a", true, "RESOLVE")).toThrow();
    expect(() => nextHandoffState("IN_PROGRESS", "a", "b", true, "RESOLVE")).toThrow();
    expect(nextHandoffState("IN_PROGRESS", "a", "b", true, "RELEASE")).toBe("OPEN");
    expect(() => nextHandoffState("IN_PROGRESS", "a", "b", false, "RELEASE")).toThrow();
    expect(nextHandoffState("IN_PROGRESS", "a", "a", false, "RESOLVE")).toBe("RESOLVED");
    expect(nextHandoffState("RESOLVED", "a", "b", false, "REOPEN")).toBe("OPEN");
  });
  it("rejects invented status, ownership overrides and unsafe or insufficient resolution evidence", () => {
    const base = { action: "RESOLVE", expectedVersion: 1, note: "Pedido revisto com a equipa." };
    expect(handoffInput.safeParse(base).success).toBe(true);
    for (const changes of [{ note: "curta" }, { note: "x".repeat(1001) }, { note: "abc\u0001defghijk" }, { assignedToId: "other" }, { organizationId: "other" }, { expectedVersion: 100 }]) expect(handoffInput.safeParse({ ...base, ...changes }).success).toBe(false);
    expect(handoffInput.safeParse({ ...base, action: "CLAIM" }).success).toBe(false);
    expect(queueInput.safeParse({ status: "HEALTHY" }).success).toBe(false);
    expect(queueInput.safeParse({ page: "-1" }).success).toBe(false);
  });
});
