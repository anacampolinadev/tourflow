import "dotenv/config";
import { randomUUID } from "node:crypto";
import Retell from "retell-sdk";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("../src/modules/auth/session", () => ({ auth: async () => session.userId ? { user: { id: session.userId } } : null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("../src/modules/integrations/retell-provider", async importOriginal => {
  const original = await importOriginal<typeof import("../src/modules/integrations/retell-provider")>();
  return { ...original, checkRetellAgent: vi.fn() };
});
import { getDb } from "../src/lib/db";
import { AccessDenied } from "../src/modules/auth";
import { configureRetell, verifyRetellConnection, readRetellConnection, handleRetellWebhook } from "../src/modules/integrations";
import { checkRetellAgent } from "../src/modules/integrations/retell-provider";
const suffix = randomUUID(), admin = `retell-admin-${suffix}`, owner = `retell-owner-${suffix}`, outsider = `retell-out-${suffix}`;
const orgs: string[] = []; let org = "", other = "";
const agent = `agent_${suffix}`, key = "fixture-retell-key-not-real", url = "https://tourflow.example.test/api/webhooks/retell";
async function send(event = "call_ended", callId = "call_fixture", agentId = agent, extra: Record<string, unknown> = {}) {
  const body = JSON.stringify({ event, organizationId: other, call: { call_id: callId, agent_id: agentId, transcript: "Private customer transcript", recording_url: "https://private.example.test/audio", from_number: "+351912345678", ...extra } });
  return handleRetellWebhook(new Request(url, { method: "POST", body, headers: { "content-type": "application/json", "x-retell-signature": await Retell.sign(body, key) } }));
}
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required");
  const db = getDb();
  await db.user.createMany({ data: [{ id: admin, email: `retell-admin-${suffix}@example.test`, platformRole: "SUPER_ADMIN" }, { id: owner, email: `retell-owner-${suffix}@example.test` }, { id: outsider, email: `retell-out-${suffix}@example.test` }] });
  for (let n = 0; n < 2; n++) {
    const row = await db.organization.create({ data: { name: "Retell pilot fixture", slug: `retell-${suffix}-${n}`, members: { create: { userId: owner, role: "OPERATOR_OWNER" } }, operator: { create: { responsibleName: "Test", contactEmail: "test@example.test", contactPhone: "+351912345678", plan: "MANAGED", monthlyPriceCents: 49900 } } } }); orgs.push(row.id);
  }
  [org, other] = [orgs[0]!, orgs[1]!];
});
beforeEach(async () => {
  vi.stubEnv("RETELL_API_KEY", key); vi.stubEnv("RETELL_WEBHOOK_URL", url); vi.stubEnv("RETELL_INGRESS_ENABLED", "true");
  session.userId = admin; vi.mocked(checkRetellAgent).mockReset().mockResolvedValue("API_OK");
  const db = getDb(), where = { organizationId: { in: orgs } };
  await db.user.update({ where: { id: admin }, data: { active: true } });
  await db.organizationMember.update({ where: { organizationId_userId: { organizationId: org, userId: owner } }, data: { active: true, role: "OPERATOR_OWNER" } });
  await db.retellEvent.deleteMany({ where }); await db.retellConnection.deleteMany({ where });
  await configureRetell(org, { agentId: agent, enabled: true, expectedVersion: 0 });
});
afterEach(() => { vi.unstubAllEnvs(); });
afterAll(async () => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) return;
  const db = getDb(), where = { organizationId: { in: orgs } };
  await db.retellEvent.deleteMany({ where }); await db.retellConnection.deleteMany({ where }); await db.auditLog.deleteMany({ where });
  await db.operatorProfile.deleteMany({ where }); await db.organizationMember.deleteMany({ where }); await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: [admin, owner, outsider] } } }); await db.$disconnect();
});
describe("Retell preflight isolation, evidence and signed ingress", () => {
  it("persists only reduced evidence after an actual signed ingress and ignores payload tenant overrides", async () => {
    expect(await verifyRetellConnection(org, 1)).toBe("API_OK");
    expect((await send()).status).toBe(204);
    const rows = await getDb().retellEvent.findMany({ where: { organizationId: org } }); expect(rows).toHaveLength(1); expect(rows[0]?.callHash).toMatch(/^[a-f0-9]{64}$/);
    const encoded = JSON.stringify(rows); for (const secret of ["Private customer transcript", "+351", "recording_url", "call_fixture"]) expect(encoded).not.toContain(secret);
    expect(await getDb().retellEvent.count({ where: { organizationId: other } })).toBe(0);
    expect((await readRetellConnection(org, "admin"))?.health).toMatchObject({ verified: true, eventCount: 1 });
    const audit = await getDb().auditLog.findMany({ where: { organizationId: org, action: { startsWith: "retell." } } }); expect(JSON.stringify(audit)).not.toContain(key);
  });
  it("deduplicates concurrent retries and never advances last observation on replay", async () => {
    await verifyRetellConnection(org, 1);
    expect((await Promise.all([send(), send()])).map(response => response.status)).toEqual([204, 204]);
    const before = await getDb().retellConnection.findUniqueOrThrow({ where: { organizationId: org } });
    await send(); const after = await getDb().retellConnection.findUniqueOrThrow({ where: { organizationId: org } });
    expect(await getDb().retellEvent.count({ where: { organizationId: org } })).toBe(1); expect(after.lastEventAt).toEqual(before.lastEventAt);
    for (const event of ["call_analyzed", "call_started"]) expect((await send(event)).status).toBe(204);
    expect(await getDb().retellEvent.count({ where: { organizationId: org } })).toBe(3);
  });
  it("does not accept events for unknown agents, unverified, stale or disabled connections", async () => {
    await send(); expect(await getDb().retellEvent.count({ where: { organizationId: org } })).toBe(0);
    await verifyRetellConnection(org, 1); await send("call_ended", "x", "unknown_agent");
    expect(await getDb().retellEvent.count({ where: { organizationId: org } })).toBe(0);
    await getDb().retellConnection.update({ where: { organizationId: org }, data: { checkedAt: new Date(Date.now() - 25 * 3600000) } });
    await send(); expect((await readRetellConnection(org, "admin"))?.health.verified).toBe(false);
    await configureRetell(org, { agentId: agent, enabled: false, expectedVersion: 1 }); await verifyRetellConnection(org, 2); await send();
    expect(await getDb().retellEvent.count({ where: { organizationId: org } })).toBe(0);
  });
  it("invalidates API proof after key or public URL rotation", async () => {
    await verifyRetellConnection(org, 1);
    vi.stubEnv("RETELL_API_KEY", "rotated-server-secret-key"); expect((await readRetellConnection(org, "admin"))?.health.verified).toBe(false);
    expect((await send()).status).toBe(401);
    vi.stubEnv("RETELL_API_KEY", key); vi.stubEnv("RETELL_WEBHOOK_URL", "https://changed.example.test/api/webhooks/retell");
    await send(); expect(await getDb().retellEvent.count({ where: { organizationId: org } })).toBe(0);
  });
  it("keeps API failures and missing configuration honest and rate limits repeated checks", async () => {
    vi.stubEnv("RETELL_API_KEY", ""); expect(await verifyRetellConnection(org, 1)).toBe("MISSING_CONFIG"); expect(checkRetellAgent).not.toHaveBeenCalled();
    await expect(verifyRetellConnection(org, 1)).rejects.toThrow("um minuto");
    vi.stubEnv("RETELL_API_KEY", key); await getDb().retellConnection.update({ where: { organizationId: org }, data: { checkedAt: new Date(Date.now() - 61000) } });
    vi.mocked(checkRetellAgent).mockResolvedValue("UNAVAILABLE"); expect(await verifyRetellConnection(org, 1)).toBe("UNAVAILABLE");
    expect((await readRetellConnection(org, "admin"))?.health.verified).toBe(false);
    await send(); expect(await getDb().retellEvent.count({ where: { organizationId: org } })).toBe(0);
  });
  it("rejects cross-tenant reassignment, agent changes and conflicting configuration versions", async () => {
    await expect(configureRetell(other, { agentId: agent, enabled: true, expectedVersion: 0 })).rejects.toThrow("indisponível");
    await expect(configureRetell(org, { agentId: "different_agent", enabled: true, expectedVersion: 1 })).rejects.toThrow("permanente");
    const results = await Promise.allSettled([configureRetell(org, { agentId: agent, enabled: false, expectedVersion: 1 }), configureRetell(org, { agentId: agent, enabled: false, expectedVersion: 1 })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await getDb().retellConnection.findUniqueOrThrow({ where: { organizationId: org } })).version).toBe(2);
  });
  it("allows exactly one tenant to claim an agent under concurrent allocation", async () => {
    await getDb().retellConnection.delete({ where: { organizationId: org } });
    const results = await Promise.allSettled(orgs.map(organizationId => configureRetell(organizationId, { agentId: agent, enabled: true, expectedVersion: 0 })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await getDb().retellConnection.count({ where: { agentId: agent } })).toBe(1);
  });
  it("gives owner private read only, rejects foreign readers and audits explicit admin reads", async () => {
    session.userId = owner; const db = getDb(), before = await db.auditLog.count({ where: { organizationId: org } });
    const data = await readRetellConnection(org, "owner"); expect(data?.connection?.agentId).toBe(agent); expect(JSON.stringify(data)).not.toContain("credentialHash"); expect(JSON.stringify(data)).not.toContain(key);
    expect(await db.auditLog.count({ where: { organizationId: org } })).toBe(before);
    await expect(configureRetell(org, { agentId: agent, enabled: false, expectedVersion: 1 })).rejects.toBeInstanceOf(AccessDenied);
    await expect(verifyRetellConnection(org, 1)).rejects.toBeInstanceOf(AccessDenied);
    session.userId = outsider; await expect(readRetellConnection(org, "owner")).rejects.toBeInstanceOf(AccessDenied);
    session.userId = admin; await expect(readRetellConnection(org, "owner")).rejects.toBeInstanceOf(AccessDenied); await readRetellConnection(org, "admin");
    expect(await db.auditLog.count({ where: { organizationId: org, action: "admin.retell.read" } })).toBeGreaterThan(0);
  });
  it.each(["OPERATOR_VIEWER", "OPERATOR_DISPATCHER", "DRIVER"] as const)("denies integration detail to %s", async role => {
    await getDb().organizationMember.update({ where: { organizationId_userId: { organizationId: org, userId: owner } }, data: { role } });
    session.userId = owner; await expect(readRetellConnection(org, "owner")).rejects.toBeInstanceOf(AccessDenied);
  });
  it("does not install a stale API success when settings change during the remote request", async () => {
    let finish: (value: "API_OK") => void = () => { throw new Error("Not ready"); };
    vi.mocked(checkRetellAgent).mockImplementation(() => new Promise<"API_OK">(resolve => { finish = resolve; }));
    const checking = verifyRetellConnection(org, 1), outcome = expect(checking).rejects.toThrow("mudou");
    await vi.waitFor(() => expect(checkRetellAgent).toHaveBeenCalled());
    await configureRetell(org, { agentId: agent, enabled: false, expectedVersion: 1 }); finish("API_OK"); await outcome;
    expect((await readRetellConnection(org, "admin"))?.health).toMatchObject({ enabled: false, verified: false, checkResult: "NOT_CHECKED" });
  });
  it("revalidates administrator privileges after the remote request", async () => {
    vi.mocked(checkRetellAgent).mockImplementation(async () => { await getDb().user.update({ where: { id: admin }, data: { active: false } }); return "API_OK"; });
    await expect(verifyRetellConnection(org, 1)).rejects.toBeInstanceOf(AccessDenied);
    const row = await getDb().retellConnection.findUniqueOrThrow({ where: { organizationId: org } }); expect(row.checkResult).toBe("CHECKING"); expect(row.credentialHash).toBeNull();
  });
  it("limits stored events without blocking deduplicated acknowledgements", async () => {
    await verifyRetellConnection(org, 1); await send();
    await getDb().retellEvent.createMany({ data: Array.from({ length: 4999 }, (_, i) => ({ organizationId: org, callHash: i.toString(16).padStart(64, "0"), event: "call_ended" })) });
    expect((await send()).status).toBe(204); expect((await send("call_ended", "new_call")).status).toBe(503);
    expect((await readRetellConnection(org, "admin"))?.health).toMatchObject({ eventCount: 5000, quotaReached: true });
  });
  it("rolls back the receipt if updating the observation fails", async () => {
    await verifyRetellConnection(org, 1); const db = getDb(), name = `retell_fail_${suffix.replaceAll("-", "")}`;
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId" = '${org}' AND NEW."lastEventAt" IS NOT NULL THEN RAISE EXCEPTION 'fixture retell update failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE UPDATE ON "RetellConnection" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    try { expect((await send()).status).toBe(503); } finally { await db.$executeRawUnsafe(`DROP TRIGGER ${name} ON "RetellConnection"`); await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`); }
    expect(await db.retellEvent.count({ where: { organizationId: org } })).toBe(0);
    expect((await db.retellConnection.findUniqueOrThrow({ where: { organizationId: org } })).lastEventAt).toBeNull();
  });
  it("does not grant publication, session, reservation or dispatch authority", async () => {
    const before = await getDb().operatorProfile.findUniqueOrThrow({ where: { organizationId: org } });
    await verifyRetellConnection(org, 1); await send("call_analyzed", "x", agent, { metadata: { consent: true, bookingId: "other", operatorStatus: "LIVE" }, call_analysis: { call_successful: true } });
    expect(await getDb().booking.count({ where: { organizationId: org } })).toBe(0); expect(await getDb().assistantConversation.count({ where: { organizationId: org } })).toBe(0);
    expect(await getDb().operatorProfile.findUniqueOrThrow({ where: { organizationId: org } })).toEqual(before);
  });
  it("rejects impossible verification evidence and event kinds at the database boundary", async () => {
    const db = getDb();
    await expect(db.retellConnection.update({ where: { organizationId: org }, data: { checkResult: "API_OK", checkedAt: new Date(), credentialHash: null } })).rejects.toThrow();
    await expect(db.retellEvent.create({ data: { organizationId: other, event: "call_ended", callHash: "a".repeat(64) } })).rejects.toThrow();
    await expect(db.retellEvent.create({ data: { organizationId: org, event: "invented", callHash: "a".repeat(64) } })).rejects.toThrow();
  });
});
