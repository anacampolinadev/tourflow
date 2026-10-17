import { describe, expect, it } from "vitest";
import { qaCases, qaChecks, summarizeQa, manualInput } from "../src/modules/qa/domain";
const checks = () => Object.keys(qaCases).map(key => ({ key, status: "PASS", detail: "Verified" }));
describe("QA evidence and publication boundary", () => {
  it("never equates internal contract passes with conversation or production approval", () => {
    const data = checks(); data.find(item => item.key === "CONVERSATIONS")!.status = "BLOCKED";
    expect(summarizeQa(data)).toMatchObject({ passed: 33, failed: 0, blocked: 0, total: 33, internalReady: true, productionReady: false });
    data.find(item => item.key === "PRICE")!.status = "FAIL"; expect(summarizeQa(data).internalReady).toBe(false);
    expect(summarizeQa(checks()).productionReady).toBe(false);
  });
  it("rejects missing, duplicate or unknown checks and unbounded manual evidence", () => {
    const missing = checks().slice(1); expect(qaChecks.safeParse(missing).success).toBe(false);
    const duplicate = checks(); duplicate[0] = duplicate[1]!; expect(qaChecks.safeParse(duplicate).success).toBe(false);
    const unknown = checks(); unknown[0]!.key = "INVENTED_PASS"; expect(qaChecks.safeParse(unknown).success).toBe(false);
    const input = { scenario: "NORMAL_BOOKING", expectedRevision: 0, decision: "BLOCKED", note: "Aguardar integração para avaliar a conversa real." };
    expect(manualInput.safeParse(input).success).toBe(true);
    for (const changes of [{ scenario: "UNKNOWN" }, { expectedRevision: 10 }, { note: "too short" }, { note: "x".repeat(1001) }, { organizationId: "other" }]) expect(manualInput.safeParse({ ...input, ...changes }).success).toBe(false);
  });
});
