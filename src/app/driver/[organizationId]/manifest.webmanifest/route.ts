import type { MetadataRoute } from "next";
import { AccessDenied } from "@/modules/auth";
import { readBrandIdentity } from "@/modules/branding";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "Content-Type": "application/manifest+json", "X-Content-Type-Options": "nosniff" };
  try {
    const brand = await readBrandIdentity(organizationId);
    const manifest: MetadataRoute.Manifest = { id: `/driver/${organizationId}`, name: brand.generated ? `${brand.displayName} — Motorista` : "TourFlow — Motorista", short_name: brand.generated ? brand.displayName.slice(0, 24) : "TourFlow", lang: "pt", start_url: `/driver/${organizationId}`, scope: "/driver", display: "standalone", background_color: "#f3f6f4", theme_color: brand.generated ? brand.primaryColor : "#143f38", icons: [192, 512].map(size => ({ src: brand.generated ? `/api/organizations/${organizationId}/brand/icon${size}?v=${brand.version}` : `/driver/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })) };
    return Response.json(manifest, { headers });
  } catch (error) { if (error instanceof AccessDenied) return new Response(null, { status: 404, headers }); throw error; }
}
