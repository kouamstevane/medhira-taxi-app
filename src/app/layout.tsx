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
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import LayoutClient from "./LayoutClient";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

/**
 * Configuration du viewport pour le responsive et PWA
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
    default: "Medjira - Taxi et Livraison au Canada",
    template: "%s | Medjira",
  },
  description: 
    "Application de mobilité et livraison au Canada. Commander un taxi ou faire livrer vos repas en quelques clics. Service rapide, fiable et sécurisé.",
  keywords: [
    "taxi",
    "livraison",
    "canada",
    "toronto",
    "ottawa",
    "montréal",
    "transport",
    "medjira",
    "mobilité",
    "VTC",
    "course",
    "chauffeur",
    "food delivery",
  ],
  authors: [{ name: "Medjira Service", url: "https://medjira.com" }],
  creator: "Medjira Service",
  publisher: "Medjira Service",
  
  // Open Graph (Facebook, LinkedIn, etc.)
  openGraph: {
    type: "website",
    locale: "fr_CA",
    url: "https://medjira.com",
    siteName: "Medjira",
    title: "Medjira - Taxi et Livraison au Canada",
    description: "Commander un taxi ou faire livrer vos repas en quelques clics",
    images: [
      {
        url: "/images/og-image.webp",
        width: 1200,
        height: 630,
        alt: "Medjira - Service de taxi et livraison",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "Medjira - Taxi et Livraison",
    description: "Commander un taxi ou faire livrer vos repas en quelques clics",
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
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>

      <body
        className="font-sans antialiased bg-background text-foreground min-h-screen"
      >
        <AuthProvider>
          <LayoutClient>
            {children}
          </LayoutClient>
        </AuthProvider>
      </body>
    </html>
  );
}