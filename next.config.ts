import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
    eslint: {
    // ⚠️ Attention : ça ignore tous les problèmes ESLint en build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Ignore les erreurs TypeScript pendant le build
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
