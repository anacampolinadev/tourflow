import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import Retell from "retell-sdk";
import { callEvents } from "./domain";
export function retellEnvironment() {
  if (process.env.RETELL_INGRESS_ENABLED !== "true") return null;
  const key = process.env.RETELL_API_KEY?.trim(), rawUrl = process.env.RETELL_WEBHOOK_URL?.trim();
  if (!key || key.length < 10 || key.length > 512 || /\s/.test(key) || !rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || !url.hostname.includes(".") || isIP(url.hostname) || url.hostname.endsWith(".localhost") || url.username || url.password || url.search || url.hash || url.pathname !== "/api/webhooks/retell" || url.port) return null;
    return { key, webhookUrl: url.href, fingerprint: createHash("sha256").update(key).update("\0").update(url.href).digest("hex") };
  } catch { return null; }
}
export async function checkRetellAgent(agentId: string, environment: NonNullable<ReturnType<typeof retellEnvironment>>) {
  try {
    const agent = await new Retell({ apiKey: environment.key, maxRetries: 0, timeout: 4000, logLevel: "off" }).agent.retrieve(agentId);
    const events = agent.webhook_events;
    return agent.agent_id === agentId && agent.webhook_url === environment.webhookUrl && (!events || callEvents.every(event => events.includes(event))) ? "API_OK" : "WEBHOOK_MISMATCH";
  } catch { return "UNAVAILABLE"; }
}
export async function validRetellSignature(body: string, signature: string | null, key: string) {
  return Boolean(signature && signature.length <= 200 && await Retell.verify(body, key, signature));
}
