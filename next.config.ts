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
  serverExternalPackages: ['firebase-admin', 'stripe', 'resend', 'sharp', 'nodemailer'],
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [
      'firebase/auth',
      'firebase/firestore',
      'firebase/storage',
      'firebase/functions',
      'firebase/database',
      'firebase/messaging',
      'lucide-react',
      'radix-ui',
      'class-variance-authority',
      '@stripe/stripe-js',
      '@stripe/react-stripe-js',
    ],
  },
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{ kebabCase member }}',
    },
  },
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
  async headers() {
    if (isMobile) return [];
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  turbopack: {},
};

export default nextConfig;
