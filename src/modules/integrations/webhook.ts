import "server-only";
import { retellEvent } from "./domain";
import { recordRetellEvent } from "./service";
import { retellEnvironment, validRetellSignature } from "./retell-provider";
const MAX_BYTES = 1024 * 1024;
class BadRequest extends Error { constructor(readonly status: number) { super("Request rejected"); } }
async function rawBody(request: Request) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) throw new BadRequest(413);
  const reader = request.body?.getReader(); if (!reader) throw new BadRequest(400);
  const chunks: Uint8Array[] = []; let total = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > MAX_BYTES) { await reader.cancel(); throw new BadRequest(413); } chunks.push(value); }
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks, total)); } catch { throw new BadRequest(400); }
}
export async function handleRetellWebhook(request: Request) {
  const reply = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  const environment = retellEnvironment(); if (!environment) return reply(503);
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply(415);
  const signature = request.headers.get("x-retell-signature"); if (!signature || signature.length > 200) return reply(401);
  try {
    const body = await rawBody(request);
    if (!await validRetellSignature(body, signature, environment.key)) return reply(401);
    let decoded: unknown; try { decoded = JSON.parse(body); } catch { return reply(400); }
    if (!decoded || typeof decoded !== "object" || !("event" in decoded)) return reply(400);
    if (!["call_started", "call_ended", "call_analyzed"].includes(String(decoded.event))) return reply(204);
    const parsed = retellEvent.safeParse(decoded); if (!parsed.success) return reply(400);
    await recordRetellEvent(parsed.data, environment.fingerprint);
    return reply(204);
  } catch (error) { return reply(error instanceof BadRequest ? error.status : 503); }
}
