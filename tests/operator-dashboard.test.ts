import { describe, expect, it } from "vitest";
import { dashboardInput, dateOffset, listInput, periodBounds, reportInput, todayInZone } from "../src/modules/operator/domain";
describe("operator reporting periods", () => {
  it("derives today in the operator zone rather than the server UTC date", () => {
    expect(todayInZone("America/Los_Angeles", new Date("2026-01-01T00:30Z"))).toBe("2025-12-31");
    expect(todayInZone("Asia/Tokyo", new Date("2026-12-31T23:30Z"))).toBe("2027-01-01");
  });
  it("uses 23 and 25 hour days across Lisbon daylight saving changes", () => {
    for (const [date, hours] of [["2026-03-29", 23], ["2026-10-25", 25]] as const) {
      const interval = periodBounds(date, date, "Europe/Lisbon");
      expect(interval.endsAt.valueOf() - interval.startsAt.valueOf()).toBe(hours * 3600000);
    }
  });
  it("allows at most 31 inclusive dates and rejects invalid or reversed periods", () => {
    expect(reportInput.safeParse({ from: "2026-01-01", until: "2026-01-31" }).success).toBe(true);
    for (const period of [{ from: "2026-01-01", until: "2026-02-01" }, { from: "2026-01-02", until: "2026-01-01" }, { from: "2026-02-30", until: "2026-03-01" }]) expect(reportInput.safeParse(period).success).toBe(false);
    expect(dateOffset("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("bounds lists, trims search and rejects caller-supplied tenant fields", () => {
    expect(listInput.parse({ search: "  Sintra  " }).search).toBe("Sintra");
    expect(dashboardInput.safeParse({ page: 0 }).success).toBe(false);
    expect(listInput.safeParse({ page: 10001 }).success).toBe(false);
    expect(listInput.safeParse({ search: "a".repeat(121) }).success).toBe(false);
    expect(dashboardInput.safeParse({ organizationId: "other" }).success).toBe(false);
  });
});
