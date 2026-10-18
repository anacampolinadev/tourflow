import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getDb } from "../src/lib/db";
import { inspectPilotDatabase, inspectPilotSmtp } from "../scripts/pilot/diagnostics";
const actor = `pilot-check-${randomUUID()}`;
const folder = resolve("prisma/migrations");
const expected = readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => ({ name: entry.name, checksum: createHash("sha256").update(readFileSync(resolve(folder, entry.name, "migration.sql"))).digest("hex") }));
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.endsWith("_test")) throw new Error("Dedicated _test database required");
  await getDb().user.create({ data: { id: actor, email: `${actor}@example.test`, platformRole: "SUPER_ADMIN" } });
});
afterAll(async () => { if (process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) { await getDb().user.deleteMany({ where: { id: actor } }); await getDb().$disconnect(); } });
describe("Pilot read-only database inspection", () => {
  it("checks actual schema, checksums, extension and admin without modifying data or claiming TLS on the plain CI connection", async () => {
    const db = getDb(), users = await db.user.count(), audits = await db.auditLog.count();
    const result = await inspectPilotDatabase(process.env.DATABASE_URL!, expected);
    expect(result).toMatchObject({ ready: false, code: "DATABASE_INSPECTED", tlsActive: false, extensionReady: true, adminReady: true, migrations: { ready: true, pendingCount: 0, changedCount: 0 } });
    expect(await db.user.count()).toBe(users); expect(await db.auditLog.count()).toBe(audits);
  });
  it("detects changed and pending migration evidence without applying or rolling back migrations", async () => {
    const changed = expected.map((row, index) => index === 0 ? { ...row, checksum: "different" } : row);
    expect(await inspectPilotDatabase(process.env.DATABASE_URL!, changed)).toMatchObject({ ready: false, migrations: { ready: false, changedCount: 1 } });
    expect(await inspectPilotDatabase(process.env.DATABASE_URL!, [...expected, { name: "not_applied_fixture", checksum: "a" }])).toMatchObject({ ready: false, migrations: { pendingCount: 1 } });
  });
  it("redacts connection failures", async () => {
    const result = await inspectPilotDatabase("postgresql://private-user:private-password@127.0.0.1:1/private_test", expected);
    expect(result).toEqual({ ready: false, code: "DATABASE_UNAVAILABLE_OR_SCHEMA_UNREADABLE" });
  });
  it("rejects plaintext SMTP rather than passing the local Mailpit fixture as production email readiness", async () => {
    const result = await inspectPilotSmtp({ EMAIL_SERVER_HOST: "localhost", EMAIL_SERVER_PORT: "1025", EMAIL_SERVER_USER: "local", EMAIL_SERVER_PASSWORD: "local" });
    expect(result).toMatchObject({ ready: false, messageSent: false, senderAccepted: false });
  });
});
