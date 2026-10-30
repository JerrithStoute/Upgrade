import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // Don't announce what the server runs on.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV === "production") }];
  },
  // The lists and templates moved from Settings to the Catalog (2026-10-30): old bookmarks and links still land.
  async redirects() {
    return ["items", "doors", "windows", "member-sizes", "span-tables", "takeoff-templates", "estimate-templates", "schedule-templates"].flatMap((p) => [
      { source: `/settings/${p}`, destination: `/catalog/${p}`, permanent: false },
      { source: `/settings/${p}/:rest*`, destination: `/catalog/${p}/:rest*`, permanent: false },
    ]);
  },
  experimental: {
    // Takeoff plan sets can be up to 100 MB (other uploads stay at 25 MB, see src/lib/uploads.ts).
    serverActions: { bodySizeLimit: "110mb" },
    // The login proxy buffers request bodies; without this, uploads over 10 MB are cut off.
    proxyClientMaxBodySize: "110mb",
  },
};

export default nextConfig;
