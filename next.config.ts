import type { NextConfig } from "next";

const isMobile = process.env.MOBILE_BUILD === 'true';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/driver/historique', destination: '/driver/activite', permanent: true },
      { source: '/driver/gains',      destination: '/driver/activite', permanent: true },
    ]
  },
  output: isMobile ? 'export' : undefined,
  trailingSlash: !isMobile,
  skipTrailingSlashRedirect: isMobile,
  // Désactiver les source maps en production pour réduire la taille
  productionBrowserSourceMaps: false,
  // Optimisations agressives
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Optimisation des images
  images: {
    unoptimized: isMobile,
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
  // Configuration Turbopack (Next.js 16+)
  turbopack: {
    // Configuration vide car les optimisations sont gérées automatiquement
  },
};

export default nextConfig;
