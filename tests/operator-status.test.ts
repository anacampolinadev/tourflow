import { describe, expect, it } from "vitest";
import { transitionOperator, operatorStatuses, InvalidTransition } from "../src/modules/tenants/status";

describe("operator lifecycle in Sprint 02", () => {
  it("advances negotiation to contracted and onboarding", () => {
    expect(transitionOperator("LEAD", "CONTRACTED")).toBe("CONTRACTED");
    expect(transitionOperator("CONTRACTED", "ONBOARDING")).toBe("ONBOARDING");
  });
  it("permits suspension in the initial stages", () => {
    for (const from of ["LEAD", "CONTRACTED", "ONBOARDING"] as const) expect(transitionOperator(from, "SUSPENDED")).toBe("SUSPENDED");
  });
  it.each(operatorStatuses)("cannot publish %s through this sprint", (from) => {
    for (const to of ["APPROVED", "GENERATING", "LIVE", "SANDBOX"] as const) expect(() => transitionOperator(from, to)).toThrow(InvalidTransition);
  });
  it("rejects skips, reversal and unsafe reactivation", () => {
    expect(() => transitionOperator("LEAD", "ONBOARDING")).toThrow(InvalidTransition);
    expect(() => transitionOperator("CONTRACTED", "LEAD")).toThrow(InvalidTransition);
    expect(() => transitionOperator("SUSPENDED", "ONBOARDING")).toThrow(InvalidTransition);
  });
});
