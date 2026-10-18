import { handleRetellWebhook } from "@/modules/integrations";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handleRetellWebhook(request); }
