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
  experimental: {
    // Takeoff plan sets can be up to 100 MB (other uploads stay at 25 MB, see src/lib/uploads.ts).
    serverActions: { bodySizeLimit: "110mb" },
    // The login proxy buffers request bodies; without this, uploads over 10 MB are cut off.
    proxyClientMaxBodySize: "110mb",
  },
};

export default nextConfig;
