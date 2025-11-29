import type { NextConfig } from "next";

const isMobile = process.env.MOBILE_BUILD === 'true';

const nextConfig: NextConfig = {
  output: isMobile ? 'export' : undefined,
  // Désactiver les source maps en production pour réduire la taille
  productionBrowserSourceMaps: false,
  // Optimisations agressives
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Optimisation des images
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        pathname: '/**',
      },
    ],
    deviceSizes: [640, 828, 1200],
    imageSizes: [16, 32, 48, 64, 96],
    formats: ['image/webp'],
    minimumCacheTTL: 60,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      // Optimisations de production
      config.optimization = {
        ...config.optimization,
        minimize: true,
        usedExports: true,
        sideEffects: false,
      };
    }
    return config;
  },
};

export default nextConfig;
