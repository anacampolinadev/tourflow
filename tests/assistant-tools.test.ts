import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
import { toolRequest } from "../src/modules/assistants/tools-domain";
const input = { serviceId: "service", serviceVersion: 0, date: "2026-12-01", time: "10:00", passengers: 4, language: "pt", customerName: "Test Customer", customerEmail: "test@example.test", customerPhone: "+351912345678" };
describe("Alana tool schemas", () => {
  it("rejects arbitrary functions, identity, quote overrides and direct database arguments", () => {
    for (const extra of [{ organizationId: "other" }, { actorId: "owner" }, { totalPriceCents: 1 }, { vehicleId: "other" }, { sql: "SELECT" }, { confirmed: true }]) expect(toolRequest.safeParse({ tool: "create_booking", input: { ...input, ...extra } }).success).toBe(false);
    for (const tool of ["cancel_booking", "modify_booking", "sql", "dispatch"]) expect(toolRequest.safeParse({ tool, input: {} }).success).toBe(false);
    expect(toolRequest.safeParse({ tool: "create_booking", input, organizationId: "other" }).success).toBe(false);
  });
  it("requires a version and language, bounds queries and rejects invalid dates/contacts", () => {
    expect(toolRequest.safeParse({ tool: "create_booking", input }).success).toBe(true);
    for (const changes of [{ serviceVersion: undefined }, { language: undefined }, { date: "2026-02-30" }, { customerEmail: "invalid" }, { passengers: 0 }]) expect(toolRequest.safeParse({ tool: "create_booking", input: { ...input, ...changes } }).success).toBe(false);
    expect(toolRequest.safeParse({ tool: "get_services", input: { page: 10001 } }).success).toBe(false);
    expect(toolRequest.safeParse({ tool: "handoff_to_human", input: { reason: "x".repeat(501) } }).success).toBe(false);
  });
});
