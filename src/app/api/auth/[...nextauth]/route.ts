import { handlers } from "@/modules/auth";
import { getAuthEnv } from "@/lib/env";
import type { NextRequest } from "next/server";

function canonicalRequest(request: NextRequest): boolean {
  return request.nextUrl.origin === new URL(getAuthEnv().AUTH_URL).origin;
}

export async function GET(request: NextRequest) {
  if (!canonicalRequest(request)) return new Response("Invalid origin", { status: 400 });
  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  if (!canonicalRequest(request)) return new Response("Invalid origin", { status: 400 });
  return handlers.POST(request);
}
