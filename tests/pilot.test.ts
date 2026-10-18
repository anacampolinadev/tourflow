import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const mail = vi.hoisted(() => ({ verify: vi.fn(), close: vi.fn(), create: vi.fn() }));
vi.mock("nodemailer", () => ({ createTransport: mail.create }));
import { inspectPilotEnvironment } from "../scripts/pilot/environment";
import { compareMigrations, inspectPilotSmtp } from "../scripts/pilot/diagnostics";
const env = () => ({ TOURFLOW_ENVIRONMENT: "pilot", AUTH_URL: "https://pilot.tourflow.pt", AUTH_SECRET: "fixture-89x-2Yr-n7Uv-MpQ6z-AbCdEfGh", DATABASE_URL: "postgresql://pilot:private-password@db.provider.pt/pilot?sslmode=verify-full", EMAIL_SERVER_HOST: "smtp.provider.pt", EMAIL_SERVER_PORT: "587", EMAIL_SERVER_USER: "pilot-user", EMAIL_SERVER_PASSWORD: "private-smtp-password", EMAIL_FROM: "pilot@tourflow.pt", RETELL_INGRESS_ENABLED: "false" });
afterEach(() => vi.clearAllMocks());
describe("Pilot configuration and release checks", () => {
  it("distinguishes configuration checks from production approval and never returns credentials", () => {
    const value = env(), result = inspectPilotEnvironment(value); expect(result.configurationReady).toBe(true); expect(result.productionReady).toBe(false);
    const encoded = JSON.stringify(result); for (const secret of [value.AUTH_SECRET, value.DATABASE_URL, value.EMAIL_SERVER_PASSWORD, value.EMAIL_SERVER_USER]) expect(encoded).not.toContain(secret);
    expect(inspectPilotEnvironment({}).configurationReady).toBe(false);
  });
  it.each([
    { TOURFLOW_ENVIRONMENT: "production" }, { AUTH_URL: "http://pilot.tourflow.pt" }, { AUTH_URL: "https://pilot.tourflow.pt/other" }, { AUTH_URL: "https://user:secret@pilot.tourflow.pt" },
    { AUTH_SECRET: "x".repeat(40) }, { DATABASE_URL: "postgresql://user:secret@db.provider.pt/pilot?sslmode=no-verify" }, { DATABASE_URL: "postgresql://user:secret@localhost/pilot?sslmode=verify-full" },
    { DATABASE_URL: "postgresql://user:secret@db.provider.pt/pilot?sslmode=verify-full&ssl=false" }, { EMAIL_SERVER_HOST: "localhost" }, { EMAIL_SERVER_PORT: "1025" },
    { EMAIL_SERVER_PASSWORD: "local" }, { EMAIL_FROM: "pilot@example.test" }, { RETELL_INGRESS_ENABLED: "true" }, { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
  ])("blocks incomplete or unsafe pilot configuration %#", changes => expect(inspectPilotEnvironment({ ...env(), ...changes }).configurationReady).toBe(false));
  it("blocks pending, modified, newer, unfinished or duplicate migrations", () => {
    const expected = [{ name: "001", checksum: "a" }], row = { migration_name: "001", checksum: "a", finished_at: new Date() };
    expect(compareMigrations(expected, [row]).ready).toBe(true);
    for (const rows of [[], [{ ...row, checksum: "changed" }], [row, { ...row, migration_name: "newer" }], [{ ...row, finished_at: null }], [row, row]]) expect(compareMigrations(expected, rows).ready).toBe(false);
  });
  it("verifies SMTP with mandatory TLS without sending messages or approving the sender", async () => {
    mail.create.mockReturnValue({ verify: mail.verify.mockResolvedValue(true), close: mail.close });
    expect(await inspectPilotSmtp(env())).toMatchObject({ ready: true, messageSent: false, senderAccepted: false });
    expect(mail.create).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true, secure: false, tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" }, logger: false, debug: false }));
    expect(mail.close).toHaveBeenCalledOnce();
    mail.verify.mockRejectedValue(new Error("private smtp credentials in upstream failure"));
    const result = await inspectPilotSmtp(env()); expect(result.ready).toBe(false); expect(JSON.stringify(result)).not.toContain("private smtp");
  });
  it("the CLI fails closed and prints names only when supplied unsafe secret-bearing values", () => {
    const value = { ...env(), AUTH_SECRET: "do-not-print-secret\nmalicious", DATABASE_URL: "invalid-private-db-password" };
    const result = spawnSync(process.execPath, ["--import", "tsx", resolve("scripts/pilot/check.ts"), "--config-only"], { env: { ...process.env, ...value }, encoding: "utf8", timeout: 15000 });
    expect(result.status).toBe(1); expect(result.stdout).toContain('"deploymentReady": false');
    for (const secret of [value.AUTH_SECRET, value.DATABASE_URL, value.EMAIL_SERVER_PASSWORD]) expect(result.stdout + result.stderr).not.toContain(secret);
  });
});
