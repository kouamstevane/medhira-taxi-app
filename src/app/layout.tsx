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
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import LayoutClient from "./LayoutClient";

/**
 * Configuration de la police principale (Inter)
 * Inter est une police fiable et toujours disponible sur Google Fonts
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/**
 * Configuration du viewport pour le responsive et PWA
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#f29200",
};

/**
 * Métadonnées de l'application
 * Optimisées pour le SEO, Open Graph et Twitter Cards
 */
export const metadata: Metadata = {
  title: {
    default: "Medjira - Taxi et Livraison au Cameroun",
    template: "%s | Medjira",
  },
  description: 
    "Application de mobilité et livraison au Cameroun. Commander un taxi ou faire livrer vos repas en quelques clics. Service rapide, fiable et sécurisé.",
  keywords: [
    "taxi",
    "livraison",
    "cameroun",
    "douala",
    "yaoundé",
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
    locale: "fr_FR",
    url: "https://medjira.com",
    siteName: "Medjira",
    title: "Medjira - Taxi et Livraison au Cameroun",
    description: "Commander un taxi ou faire livrer vos repas en quelques clics",
    images: [
      {
        url: "/images/og-image.png",
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
    images: ["/images/twitter-image.png"],
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
    // yandex: "votre-code-yandex",
    // other: "votre-autre-verification",
  },
};

/**
 * Root Layout Component
 * 
 * Enveloppe toute l'application avec les providers nécessaires.
 * Le AuthProvider rend l'état d'authentification disponible dans tous les composants.
 * Le LayoutClient gère le header conditionnel et les éléments client-side.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Préconnexion aux domaines externes pour optimiser le chargement */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://maps.googleapis.com" />
        
        {/* DNS Prefetch pour Firebase */}
        <link rel="dns-prefetch" href="https://firebaseapp.com" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
      </head>
      
      <body
        className={`${inter.variable} antialiased bg-[#f5f5f5] min-h-screen`}
      >
        {/* AuthProvider rend l'authentification disponible dans toute l'app */}
        <AuthProvider>
          {/* LayoutClient gère les éléments conditionnels et client-side */}
          <LayoutClient>
            {children}
          </LayoutClient>
        </AuthProvider>
      </body>
    </html>
  );
}
