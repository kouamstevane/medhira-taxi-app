#!/bin/bash

mkdir -p src/app/login
mkdir -p src/app/register

mkdir -p src/components
mkdir -p src/features/auth
mkdir -p src/features/booking
mkdir -p src/features/geolocation
mkdir -p src/features/payments

mkdir -p src/lib

mkdir -p src/layouts

mkdir -p src/roles/client/dashboard
mkdir -p src/roles/client/bookings
mkdir -p src/roles/client/profile
mkdir -p src/roles/client/rating

mkdir -p src/roles/driver/dashboard
mkdir -p src/roles/driver/rides
mkdir -p src/roles/driver/earnings
mkdir -p src/roles/driver/profile

mkdir -p src/styles
mkdir -p src/types

# === src/app/layout.tsx ===
cat > src/app/layout.tsx << 'EOF'
import React from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <title>My Taxi App</title>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
EOF

# === src/app/page.tsx ===
cat > src/app/page.tsx << 'EOF'
import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{padding: 20}}>
      <h1>Bienvenue sur My Taxi App</h1>
      <p>Connectez-vous en tant que <Link href="/login">Client</Link> ou <Link href="/login">Chauffeur</Link></p>
    </main>
  );
}
EOF

# === src/app/login/page.tsx ===
mkdir -p src/app/login
cat > src/app/login/page.tsx << 'EOF'
export default function LoginPage() {
  return (
    <main style={{padding: 20}}>
      <h1>Page de connexion</h1>
      <p>Formulaire de connexion à implémenter ici.</p>
    </main>
  );
}
EOF

# === src/app/register/page.tsx ===
mkdir -p src/app/register
cat > src/app/register/page.tsx << 'EOF'
export default function RegisterPage() {
  return (
    <main style={{padding: 20}}>
      <h1>Page d'inscription</h1>
      <p>Formulaire d'inscription à implémenter ici.</p>
    </main>
  );
}
EOF

# === src/components/Navbar.tsx ===
cat > src/components/Navbar.tsx << 'EOF'
import Link from "next/link";

export default function Navbar() {
  return (
    <nav style={{padding: "10px 20px", background: "#eee"}}>
      <Link href="/">Accueil</Link> |{" "}
      <Link href="/roles/client/dashboard">Client Dashboard</Link> |{" "}
      <Link href="/roles/driver/dashboard">Chauffeur Dashboard</Link>
    </nav>
  );
}
EOF

# === src/components/Footer.tsx ===
cat > src/components/Footer.tsx << 'EOF'
export default function Footer() {
  return (
    <footer style={{padding: 20, textAlign: "center", borderTop: "1px solid #ddd"}}>
      &copy; 2025 My Taxi App
    </footer>
  );
}
EOF

# === src/components/BookingForm.tsx ===
cat > src/components/BookingForm.tsx << 'EOF'
import { useState } from "react";

export default function BookingForm() {
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Réservation de ${pickup} vers ${destination}`);
  };

  return (
    <form onSubmit={handleSubmit} style={{maxWidth: 400, margin: "auto"}}>
      <h2>Réserver un trajet</h2>
      <input
        type="text"
        placeholder="Lieu de prise en charge"
        value={pickup}
        onChange={(e) => setPickup(e.target.value)}
        required
        style={{display: "block", width: "100%", marginBottom: 10, padding: 8}}
      />
      <input
        type="text"
        placeholder="Destination"
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        required
        style={{display: "block", width: "100%", marginBottom: 10, padding: 8}}
      />
      <button type="submit" style={{padding: 10, width: "100%"}}>Réserver</button>
    </form>
  );
}
EOF

# === src/components/Map.tsx ===
cat > src/components/Map.tsx << 'EOF'
export default function Map() {
  return (
    <div style={{width: "100%", height: 300, backgroundColor: "#ccc", textAlign: "center", lineHeight: "300px"}}>
      Carte ici (Google Maps / Leaflet à intégrer)
    </div>
  );
}
EOF

# === src/features/auth/index.ts ===
echo "// Auth utilities and hooks here" > src/features/auth/index.ts

# === src/features/booking/index.ts ===
echo "// Booking business logic here" > src/features/booking/index.ts

# === src/features/geolocation/index.ts ===
echo "// Geolocation helper functions here" > src/features/geolocation/index.ts

# === src/features/payments/index.ts ===
echo "// Payment processing logic here" > src/features/payments/index.ts

# === src/lib/firebase.ts ===
cat > src/lib/firebase.ts << 'EOF'
// Initialize Firebase here (placeholder)
export const firebaseConfig = {};
EOF

# === src/lib/api.ts ===
echo "// API calls here" > src/lib/api.ts

# === src/lib/utils.ts ===
echo "// Utility functions here" > src/lib/utils.ts

# === src/layouts/ClientLayout.tsx ===
cat > src/layouts/ClientLayout.tsx << 'EOF'
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main style={{minHeight: "80vh", padding: 20}}>{children}</main>
      <Footer />
    </>
  );
}
EOF

# === src/layouts/DriverLayout.tsx ===
cat > src/layouts/DriverLayout.tsx << 'EOF'
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main style={{minHeight: "80vh", padding: 20, backgroundColor: "#f0f0f0"}}>{children}</main>
      <Footer />
    </>
  );
}
EOF

# === src/roles/client/dashboard/page.tsx ===
cat > src/roles/client/dashboard/page.tsx << 'EOF'
import ClientLayout from "../../../layouts/ClientLayout";

export default function ClientDashboard() {
  return (
    <ClientLayout>
      <h1>Tableau de bord Client</h1>
      <p>Bienvenue, client ! Voici vos réservations récentes.</p>
    </ClientLayout>
  );
}
EOF

# === src/roles/client/bookings/page.tsx ===
cat > src/roles/client/bookings/page.tsx << 'EOF'
import ClientLayout from "../../../layouts/ClientLayout";

export default function ClientBookings() {
  return (
    <ClientLayout>
      <h1>Mes réservations</h1>
      <p>Liste des réservations à venir.</p>
    </ClientLayout>
  );
}
EOF

# === src/roles/client/profile/page.tsx ===
cat > src/roles/client/profile/page.tsx << 'EOF'
import ClientLayout from "../../../layouts/ClientLayout";

export default function ClientProfile() {
  return (
    <ClientLayout>
      <h1>Profil Client</h1>
      <p>Informations personnelles du client.</p>
    </ClientLayout>
  );
}
EOF

# === src/roles/client/rating/page.tsx ===
cat > src/roles/client/rating/page.tsx << 'EOF'
import ClientLayout from "../../../layouts/ClientLayout";

export default function ClientRating() {
  return (
    <ClientLayout>
      <h1>Noter un chauffeur</h1>
      <p>Formulaire pour évaluer un chauffeur.</p>
    </ClientLayout>
  );
}
EOF

# === src/roles/driver/dashboard/page.tsx ===
cat > src/roles/driver/dashboard/page.tsx << 'EOF'
import DriverLayout from "../../../layouts/DriverLayout";

export default function DriverDashboard() {
  return (
    <DriverLayout>
      <h1>Tableau de bord Chauffeur</h1>
      <p>Bienvenue, chauffeur ! Voici vos courses assignées.</p>
    </DriverLayout>
  );
}
EOF

# === src/roles/driver/rides/page.tsx ===
cat > src/roles/driver/rides/page.tsx << 'EOF'
import DriverLayout from "../../../layouts/DriverLayout";

export default function DriverRides() {
  return (
    <DriverLayout>
      <h1>Mes courses</h1>
      <p>Liste des courses disponibles ou en cours.</p>
    </DriverLayout>
  );
}
EOF

# === src/roles/driver/earnings/page.tsx ===
cat > src/roles/driver/earnings/page.tsx << 'EOF'
import DriverLayout from "../../../layouts/DriverLayout";

export default function DriverEarnings() {
  return (
    <DriverLayout>
      <h1>Mes gains</h1>
      <p>Historique des paiements reçus.</p>
    </DriverLayout>
  );
}
EOF

# === src/roles/driver/profile/page.tsx ===
cat > src/roles/driver/profile/page.tsx << 'EOF'
import DriverLayout from "../../../layouts/DriverLayout";

export default function DriverProfile() {
  return (
    <DriverLayout>
      <h1>Profil Chauffeur</h1>
      <p>Informations personnelles du chauffeur.</p>
    </DriverLayout>
  );
}
EOF

# === src/styles/globals.css ===
cat > src/styles/globals.css << 'EOF'
/* Globals CSS */
body {
  font-family: system-ui, sans-serif;
  margin: 0;
  padding: 0;
}
EOF

# === src/styles/variables.css ===
cat > src/styles/variables.css << 'EOF'
:root {
  --primary-color: #0070f3;
  --secondary-color: #1c1c1c;
}
EOF

# === src/middleware.ts ===
cat > src/middleware.ts << 'EOF'
// Middleware Next.js pour auth par rôle (exemple minimal)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();

  // Exemple : rediriger si pas connecté ou rôle non autorisé (à personnaliser)
  // Ici on ne fait rien pour le moment
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/roles/client/:path*',
    '/roles/driver/:path*',
  ],
};
EOF

# === src/types/user.ts ===
cat > src/types/user.ts << 'EOF'
export interface User {
  id: string;
  name: string;
  email: string;
  role: "client" | "driver";
}
EOF

# === src/types/booking.ts ===
cat > src/types/booking.ts << 'EOF'
export interface Booking {
  id: string;
  clientId: string;
  driverId?: string;
  pickupLocation: string;
  destination: string;
  status: "pending" | "accepted" | "completed" | "cancelled";
  createdAt: Date;
}
EOF

# === src/types/driver.ts ===
cat > src/types/driver.ts << 'EOF'
export interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string;
  licenseNumber: string;
  vehicle: string;
  rating?: number;
}
EOF

echo "Structure créée avec fichiers de base."

