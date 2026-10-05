/**
 * Layout Principal de l'Application
 * 
 * Root layout qui enveloppe toute l'application Next.js.
 * Intègre le AuthProvider pour rendre l'authentification disponible partout.
 * Configure les métadonnées SEO avancées et header global.
 * 
 * Features:
 * - AuthProvider pour l'authentification Firebase
 * - Header global conditionnel (masqué sur login/register)
 * - Métadonnées SEO optimisées avec Open Graph et Twitter Cards
 * - Support PWA avec manifest et icônes
 * - Thème personnalisé avec variables CSS
 * 
 * @layout
 */

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { translateDefault } from "@/locales";
import { AuthProvider } from "@/context/AuthContext";
import { I18nProvider } from "@/context/I18nContext";
import LayoutClient from "./LayoutClient";
import { cn } from "@/lib/utils";

const inter = { variable: '--font-sans' };

/**
 * Configuration du viewport pour le responsive et PWA
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f29200",
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

/**
 * Métadonnées de l'application
 * Optimisées pour le SEO, Open Graph et Twitter Cards
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://medjira.com'),
  title: {
    default: translateDefault('systemMessages.seo.title'),
    template: "%s | Medjira",
  },
  description: translateDefault('systemMessages.seo.description'),
  keywords: translateDefault('systemMessages.seo.keywords').split(','),
  authors: [{ name: "Medjira Service", url: "https://medjira.com" }],
  creator: "Medjira Service",
  publisher: "Medjira Service",
  
  // Open Graph (Facebook, LinkedIn, etc.)
  openGraph: {
    type: "website",
    locale: "fr_CA",
    url: "https://medjira.com",
    siteName: "Medjira",
    title: translateDefault('systemMessages.seo.title'),
    description: translateDefault('systemMessages.seo.shortDescription'),
    images: [
      {
        url: "/images/og-image.webp",
        width: 1200,
        height: 630,
        alt: translateDefault('systemMessages.seo.imageAlt'),
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: translateDefault('systemMessages.seo.shortTitle'),
    description: translateDefault('systemMessages.seo.shortDescription'),
    images: ["/images/twitter-image.webp"],
    creator: "@medjira",
  },

  // Icônes et manifest PWA
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },

  // Manifest pour PWA
  manifest: "/manifest.json",

  // Autres métadonnées
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // Vérification des propriétaires
  verification: {
    google: "votre-code-google-search-console",
  },
};

/**
 * Root Layout Component
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning className={cn("dark font-sans", inter.variable)}>
      <head>
        {/* Préconnexion aux domaines externes pour optimiser le chargement */}
        <link rel="preconnect" href="https://maps.googleapis.com" />

        {/* DNS Prefetch pour Firebase */}
        <link rel="dns-prefetch" href="https://firebaseapp.com" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />

        {/* Material Symbols Outlined (Stitch design system) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet" />
      </head>

      <body
        className="font-sans antialiased bg-background text-foreground min-h-screen"
      >
        <I18nProvider>
          <AuthProvider>
            <LayoutClient>
              {children}
            </LayoutClient>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
