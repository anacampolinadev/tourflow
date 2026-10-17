import { AccessDenied } from "@/modules/auth";
import { readBrandAsset } from "@/modules/branding";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string; asset: string }> }) {
  const { organizationId, asset } = await params;
  const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Referrer-Policy": "no-referrer" };
  if (asset !== "logo" && asset !== "icon192" && asset !== "icon512") return new Response(null, { status: 404, headers });
  try {
    const data = await readBrandAsset(organizationId, asset);
    return data ? new Response(new Uint8Array(data), { headers: { ...headers, "Content-Type": "image/png" } }) : new Response(null, { status: 404, headers });
  } catch (error) { if (error instanceof AccessDenied) return new Response(null, { status: 404, headers }); throw error; }
}
