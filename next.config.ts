import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/driver/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] }, { source: "/driver/sw.js", headers: [{ key: "Content-Type", value: "application/javascript; charset=utf-8" }, { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" }] }];
  },
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};
export default config;
