import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = { title: "Motorista · TourFlow", manifest: "/driver/manifest.webmanifest", appleWebApp: { capable: true, title: "TourFlow" }, icons: { apple: "/driver/icon-192.png" }, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#143f38" };
export default function DriverLayout({ children }: { children: ReactNode }) { return <div className="driver-shell">{children}</div>; }
