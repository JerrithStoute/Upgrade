import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  experimental: {
    // Takeoff plan sets can be up to 100 MB (other uploads stay at 25 MB, see src/lib/uploads.ts).
    serverActions: { bodySizeLimit: "110mb" },
    // The login proxy buffers request bodies; without this, uploads over 10 MB are cut off.
    proxyClientMaxBodySize: "110mb",
  },
};

export default nextConfig;
