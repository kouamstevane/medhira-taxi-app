/**
 * Layout Principal de l'Application
 * 
 * Root layout qui enveloppe toute l'application Next.js.
 * Intègre le AuthProvider pour rendre l'authentification disponible partout.
 * Configure les polices Google Fonts et les métadonnées de base.
 * 
 * @layout
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

/**
 * Configuration de la police principale (Geist Sans)
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/**
 * Configuration de la police monospace (Geist Mono)
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Métadonnées de l'application
 * Utilisées pour le SEO et l'affichage dans les navigateurs
 */
export const metadata: Metadata = {
  title: "Medjira - Taxi et Livraison",
  description: "Application de mobilité et livraison au Cameroun - Commander un taxi ou faire livrer vos repas en quelques clics",
  keywords: ["taxi", "livraison", "cameroun", "transport", "medjira"],
  authors: [{ name: "Medjira Service" }],
  viewport: "width=device-width, initial-scale=1",
  themeColor: "#f29200",
};

/**
 * Root Layout Component
 * 
 * Enveloppe toute l'application avec les providers nécessaires.
 * Le AuthProvider rend l'état d'authentification disponible dans tous les composants.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* AuthProvider rend l'authentification disponible dans toute l'app */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
