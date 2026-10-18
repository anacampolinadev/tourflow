import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
const reservation = createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
const address = reservation.address(); if (!address || typeof address === "string") throw new Error("Smoke port unavailable");
const port = address.port; await new Promise<void>(resolve => reservation.close(() => resolve()));
// NextURL normalizes loopback IP addresses to localhost. Keep that canonical
// identity while reaching only the reserved IPv4 loopback port.
const origin = `http://127.0.0.1:${port}`, canonical = `https://localhost:${port}`;
const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: process.cwd(), stdio: "ignore", env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgresql://smoke:fixture@127.0.0.1:1/smoke", AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_URL: canonical, EMAIL_SERVER_HOST: "127.0.0.1", EMAIL_SERVER_PORT: "1", EMAIL_SERVER_USER: "fixture", EMAIL_SERVER_PASSWORD: "fixture", EMAIL_FROM: "smoke@example.test", RETELL_INGRESS_ENABLED: "false" } });
child.on("error", () => {});
let stage = "startup";
async function expectResponse(path: string, statuses: number[], init?: RequestInit) { const response = await fetch(origin + path, { redirect: "manual", signal: AbortSignal.timeout(4000), ...init, headers: { "x-forwarded-proto": "https", ...init?.headers } }); if (!statuses.includes(response.status)) throw new Error(`Unexpected response ${response.status} at ${path}`); return response; }
try {
  let started = false;
  for (let attempt = 0; attempt < 120; attempt++) { if (child.exitCode !== null) break; try { if ((await fetch(origin, { signal: AbortSignal.timeout(500) })).ok) { started = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
  if (!started) throw new Error("Startup failed");
  stage = "public-pages";
  const home = await expectResponse("/", [200]); if (!(await home.text()).includes("TourFlow") || home.headers.has("x-powered-by")) throw new Error("Public page mismatch");
  const login = await expectResponse("/login", [200]); if (!(await login.text()).includes("Receber link de acesso")) throw new Error("Login missing");
  stage = "auth-origin";
  const provider = await expectResponse("/api/auth/providers", [200]); const payload = await provider.json();
  if (!payload || typeof payload !== "object" || !payload.nodemailer || new URL(payload.nodemailer.signinUrl).origin !== canonical || new URL(payload.nodemailer.callbackUrl).origin !== canonical) throw new Error("Canonical authentication origin mismatch");
  await expectResponse("/api/auth/providers", [400], { headers: { "x-forwarded-proto": "http" } });
  stage = "private-access";
  const privatePage = await expectResponse("/admin/operators", [307, 308]); if (!privatePage.headers.get("location")?.includes("/login")) throw new Error("Private route not protected");
  stage = "retell-closed";
  const hook = await expectResponse("/api/webhooks/retell", [503], { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (await hook.text()) throw new Error("Webhook revealed details");
  console.log(JSON.stringify({ runtime: "production", publicPages: true, canonicalAuthOrigin: true, privateAccessBlocked: true, retellClosed: true, emailSent: false, databaseReadinessVerified: false, cloudDeploymentVerified: false }));
} catch { console.error(`Production smoke failed at ${stage}. No secret or server log was printed.`); process.exitCode = 1; }
finally { child.kill(); if (child.exitCode === null && child.signalCode === null) await Promise.race([once(child, "close"), new Promise(resolve => setTimeout(resolve, 3000))]); }
