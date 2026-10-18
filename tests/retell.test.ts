import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Retell from "retell-sdk";
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/integrations/service", () => ({ recordRetellEvent: vi.fn() }));
import { handleRetellWebhook } from "../src/modules/integrations/webhook";
import { recordRetellEvent } from "../src/modules/integrations/service";
import { checkRetellAgent, retellEnvironment } from "../src/modules/integrations/retell-provider";
const key = "fixture-retell-secret-never-real", url = "https://tourflow.example.test/api/webhooks/retell";
const payload = { event: "call_ended", call: { agent_id: "agent_fixture", call_id: "call_fixture", transcript: "Private transcript", recording_url: "https://private.example.test/audio", from_number: "+351912345678" } };
async function request(body = JSON.stringify(payload), signature?: string, headers: Record<string, string> = {}) { return new Request(url, { method: "POST", headers: { "content-type": "application/json", "x-retell-signature": signature ?? await Retell.sign(body, key), ...headers }, body }); }
beforeEach(() => { vi.stubEnv("RETELL_API_KEY", key); vi.stubEnv("RETELL_WEBHOOK_URL", url); vi.stubEnv("RETELL_INGRESS_ENABLED", "true"); vi.mocked(recordRetellEvent).mockResolvedValue(undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });
describe("Retell raw ingress and read-only API adapter", () => {
  it("authenticates raw bytes and discards sensitive extras before persistence", async () => {
    const body = JSON.stringify(payload, null, 2);
    expect((await handleRetellWebhook(await request(body))).status).toBe(204);
    expect(recordRetellEvent).toHaveBeenCalledWith({ event: "call_ended", call: { agent_id: "agent_fixture", call_id: "call_fixture" } }, expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(JSON.stringify(vi.mocked(recordRetellEvent).mock.calls)).not.toContain("Private transcript");
    const wrong = await Retell.sign(JSON.stringify(payload), key); expect((await handleRetellWebhook(await request(body, wrong))).status).toBe(401);
    const bytes = JSON.stringify(payload), signed = await Retell.sign(bytes, key);
    const changed = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(bytes)]);
    expect((await handleRetellWebhook(new Request(url, { method: "POST", body: changed, headers: { "content-type": "application/json", "x-retell-signature": signed } }))).status).toBe(401);
  });
  it("rejects absent, malformed, tampered, wrong-key and expired signatures without persisting", async () => {
    for (const signature of ["", "invalid", await Retell.sign(JSON.stringify(payload), "wrong-secret")]) expect((await handleRetellWebhook(await request(undefined, signature))).status).toBe(401);
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now - 6 * 60000); const expired = await Retell.sign(JSON.stringify(payload), key); vi.restoreAllMocks();
    expect((await handleRetellWebhook(await request(undefined, expired))).status).toBe(401); expect(recordRetellEvent).not.toHaveBeenCalled();
  });
  it("rejects oversized declared and streamed bodies, invalid media and malformed signed JSON", async () => {
    expect((await handleRetellWebhook(await request(undefined, undefined, { "content-length": "1048577" }))).status).toBe(413);
    expect((await handleRetellWebhook(await request("x".repeat(1048577)))).status).toBe(413);
    expect((await handleRetellWebhook(await request(undefined, undefined, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await handleRetellWebhook(await request("{bad json"))).status).toBe(400);
    expect((await handleRetellWebhook(await request(JSON.stringify({ event: "call_ended", call: { agent_id: "../other", call_id: "x" } })))).status).toBe(400);
    expect(recordRetellEvent).not.toHaveBeenCalled();
  });
  it("ignores unsupported signed event kinds and returns retryable failure on persistence errors", async () => {
    expect((await handleRetellWebhook(await request(JSON.stringify({ event: "transcript_updated", call: payload.call })))).status).toBe(204);
    expect(recordRetellEvent).not.toHaveBeenCalled();
    vi.mocked(recordRetellEvent).mockRejectedValue(new Error("private database error"));
    const response = await handleRetellWebhook(await request()); expect(response.status).toBe(503); expect(await response.text()).toBe("");
  });
  it("fails closed without complete server configuration or with disabled ingress", async () => {
    for (const invalid of ["http://tourflow.example.test/api/webhooks/retell", "https://127.0.0.1/api/webhooks/retell", "https://tourflow.example.test/other", `${url}?token=bad`]) { vi.stubEnv("RETELL_WEBHOOK_URL", invalid); expect(retellEnvironment()).toBeNull(); }
    vi.stubEnv("RETELL_WEBHOOK_URL", url); vi.stubEnv("RETELL_INGRESS_ENABLED", "false"); expect((await handleRetellWebhook(await request())).status).toBe(503);
    vi.stubEnv("RETELL_INGRESS_ENABLED", "true"); vi.stubEnv("RETELL_API_KEY", ""); expect(retellEnvironment()).toBeNull();
  });
  it("only verifies the expected agent, webhook destination and lifecycle subscriptions", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ agent_id: "agent_fixture", webhook_url: url }), { status: 200, headers: { "content-type": "application/json" } })); vi.stubGlobal("fetch", fetcher);
    expect(await checkRetellAgent("agent_fixture", retellEnvironment()!)).toBe("API_OK");
    const [target, options] = fetcher.mock.calls[0]!; expect(String(target)).toBe("https://api.retellai.com/get-agent/agent_fixture"); expect(options.method).toBe("GET");
    for (const change of [{ agent_id: "other" }, { webhook_url: "https://other.example.test/hook" }, { webhook_events: ["call_started"] }]) {
      fetcher.mockImplementation(async () => new Response(JSON.stringify({ agent_id: "agent_fixture", webhook_url: url, ...change }), { headers: { "content-type": "application/json" } }));
      expect(await checkRetellAgent("agent_fixture", retellEnvironment()!)).toBe("WEBHOOK_MISMATCH");
    }
    fetcher.mockImplementation(async () => new Response("private upstream failure", { status: 401 })); expect(await checkRetellAgent("agent_fixture", retellEnvironment()!)).toBe("UNAVAILABLE");
  });
});
