import type { MetadataRoute } from "next";
export function GET() {
  const manifest: MetadataRoute.Manifest = { id: "/driver/", name: "TourFlow — Motorista", short_name: "TourFlow", description: "Serviços atribuídos ao motorista. Requer ligação e acesso autorizado.", lang: "pt", start_url: "/driver", scope: "/driver", display: "standalone", background_color: "#f3f6f4", theme_color: "#143f38", icons: [192, 512].map((size) => ({ src: `/driver/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })) };
  return Response.json(manifest, { headers: { "Content-Type": "application/manifest+json" } });
}
