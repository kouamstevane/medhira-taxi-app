"use client";

import dynamic from 'next/dynamic';
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { doc, onSnapshot, updateDoc, type DocumentSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "@/config/firebase";
import { CURRENCY_CODE, LIMITS, DEFAULT_LOCALE } from "@/utils/constants";
const ConfirmationMap = dynamic(() => import('./ConfirmationMap').then(m => ({ default: m.ConfirmationMap })), {
  ssr: false,
  loading: () => <div className="w-full h-[200px] bg-[#1A1A1A] animate-pulse rounded-xl" />
});
import { MaterialIcon } from "@/components/ui/MaterialIcon";

// Composant principal qui utilise useSearchParams
function ConfirmationContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("bookingId");

  const [booking, setBooking] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showArrival, setShowArrival] = useState(false);
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);

  useEffect(() => {
    if (!bookingId) {
      setError("ID de course manquant");
      setLoading(false);
      return;
    }

    const bookingRef = doc(db, "bookings", bookingId);
    let timeoutId: NodeJS.Timeout;

    const unsubscribe = onSnapshot(
      bookingRef,
      (docSnap: DocumentSnapshot<DocumentData>) => {
        if (!docSnap.exists()) {
          setError("Course non trouvée");
          setLoading(false);
          return;
        }

        const data = docSnap.data();
        setBooking(data);

        // Réinitialiser le timeout à chaque mise à jour
        clearTimeout(timeoutId);

        if (data.status === "pending") {
          // Timeout après 60 secondes
          timeoutId = setTimeout(() => {
            setError("Aucun chauffeur disponible après 60 secondes.");
            updateDoc(bookingRef, { status: "failed", reason: "timeout" });
          }, LIMITS.DRIVER_SEARCH_TIMEOUT);
        }

        if (data.status === "accepted" && data.driverId) {
          // Charger la position du chauffeur
          const driverRef = doc(db, "drivers", data.driverId);
          const unsubscribeDriver = onSnapshot(driverRef, (driverSnap: DocumentSnapshot<DocumentData>) => {
            if (driverSnap.exists()) {
              const driverData = driverSnap.data();
              if (driverData.lastLocation) {
                setDriverLocation(driverData.lastLocation);
                
                // Mettre à jour les directions si le point de départ est disponible
                if (data.pickupLocation) {
                  const directionsService = new google.maps.DirectionsService();
                  directionsService.route(
                    {
                      origin: driverData.lastLocation,
                      destination: data.pickupLocation,
                      travelMode: google.maps.TravelMode.DRIVING,
                    },
                    (result, status) => {
                      if (status === google.maps.DirectionsStatus.OK) {
                        setDirections(result);
                      } else {
                        console.error("Erreur de calcul d'itinéraire:", status);
                      }
                    }
                  );
                }
              }
            }
          });
          return () => unsubscribeDriver();
        }

        if (data.status === "arrived") {
          setShowArrival(true);
          setTimeout(() => setShowArrival(false), 5000);
        }

        if (data.status === "completed") {
          setFinalPrice(data.finalPrice || data.price);
        }

        setLoading(false);
      },
      (err: unknown) => {
        console.error("Erreur Firestore:", err);
        setError("Erreur de connexion");
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [bookingId]);

  const getEstimatedArrivalTime = () => {
    if (!driverLocation || !booking?.pickupLocation) return "Calcul en cours...";
    
    // Utiliser les données d'itinéraire si disponibles
    if (directions && directions.routes[0].legs[0].duration) {
      return directions.routes[0].legs[0].duration.text;
    }
    
    // Fallback au calcul manuel si pas d'itinéraire
    const distanceKm = calculateDistance(driverLocation, booking.pickupLocation);
    const timeMin = Math.ceil(distanceKm * 2); // 2 min par km
    return `${timeMin} min`;
  };

  const calculateDistance = (loc1: { lat: number; lng: number }, loc2: { lat: number; lng: number }) => {
    const R = 6371;
    const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
    const dLng = (loc2.lng - loc1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(loc1.lat * Math.PI / 180) *
              Math.cos(loc2.lat * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 bg-primary rounded-full opacity-20 animate-ping" />
          <div className="relative w-16 h-16 bg-primary rounded-full flex items-center justify-center animate-pulse">
            <MaterialIcon name="local_taxi" className="text-white text-[28px]" />
          </div>
        </div>
        <p className="text-slate-400 animate-pulse">Chargement...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="glass-card p-6 rounded-2xl w-full max-w-md text-center border border-white/10">
          <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-destructive/20">
            <MaterialIcon name="error" className="text-destructive text-[28px]" />
          </div>
          <p className="text-destructive mb-4">{error}</p>
          <button
            onClick={() => window.history.back()}
            className="w-full h-12 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-xl active:scale-[0.98] transition-transform"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="max-w-[430px] mx-auto min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 flex items-center p-4 bg-background/80 backdrop-blur-xl border-b border-white/5">
          <button
            onClick={() => window.history.back()}
            className="flex items-center justify-center size-10 rounded-full glass-card text-white active:scale-95 transition-transform"
          >
            <MaterialIcon name="arrow_back" size="md" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-white pr-10">Suivi de course</h1>
        </header>

        <main className="flex-1 p-4 space-y-4">
          {/* Carte */}
          <div className="rounded-xl overflow-hidden border border-white/10">
            <ConfirmationMap
              driverLocation={driverLocation}
              pickupLocation={booking?.pickupLocation}
              directions={directions}
            />
          </div>

          {/* Notification d'arrivée */}
          {showArrival && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl flex items-center gap-3">
              <MaterialIcon name="where_to_vote" size="md" className="text-green-400" />
              <p className="font-semibold">Votre chauffeur est arrivé !</p>
            </div>
          )}

          {/* Statut */}
          <div className="glass-card rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-4">Statut de la course</h2>

            {booking?.status === "pending" && (
              <div className="text-center py-6">
                <div className="relative w-12 h-12 mx-auto mb-4">
                  <div className="absolute inset-0 bg-primary rounded-full opacity-20 animate-ping" />
                  <div className="relative w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
                    <MaterialIcon name="search" className="text-primary text-[24px]" />
                  </div>
                </div>
                <h3 className="text-base font-semibold text-white">Recherche d&apos;un chauffeur</h3>
                <p className="text-slate-400 text-sm">En attente...</p>
              </div>
            )}

            {booking?.status === "accepted" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-white">Chauffeur en route</h3>
                  <span className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-xs font-bold">En route</span>
                </div>
                <p className="text-slate-300 text-sm"><strong>Temps estimé :</strong> {getEstimatedArrivalTime()}</p>
                {booking.driverName && (
                  <div className="mt-4 p-4 glass-card rounded-xl border border-white/5 space-y-1">
                    <p className="text-sm text-slate-300"><span className="text-slate-500">Chauffeur :</span> {booking.driverName}</p>
                    <p className="text-sm text-slate-300"><span className="text-slate-500">Véhicule :</span> {booking.carColor} {booking.carModel} ({booking.carPlate})</p>
                    <p className="text-sm text-slate-300"><span className="text-slate-500">Téléphone :</span> {booking.driverPhone}</p>
                  </div>
                )}
              </div>
            )}

            {booking?.status === "arrived" && (
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3 border border-green-500/20">
                  <MaterialIcon name="where_to_vote" className="text-green-400 text-[28px]" />
                </div>
                <h3 className="text-base font-semibold text-white">Chauffeur arrivé</h3>
                <p className="text-slate-400 text-sm">Votre chauffeur vous attend au point de départ.</p>
              </div>
            )}

            {booking?.status === "in_progress" && (
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                  <MaterialIcon name="local_taxi" className="text-primary text-[28px]" />
                </div>
                <h3 className="text-base font-semibold text-white">Course en cours</h3>
                <p className="text-slate-400 text-sm">Destination : {booking?.destination}</p>
              </div>
            )}

            {booking?.status === "completed" && finalPrice && (
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3 border border-green-500/20">
                  <MaterialIcon name="check_circle" className="text-green-400 text-[28px]" />
                </div>
                <h3 className="text-base font-semibold text-white">Course terminée</h3>
                <p className="text-2xl font-bold text-primary mt-2">{finalPrice.toLocaleString(DEFAULT_LOCALE, { minimumFractionDigits: 2 })} {CURRENCY_CODE}</p>
                <p className="text-slate-400 text-sm mt-1">Merci d&apos;avoir utilisé Medjira Taxi</p>
              </div>
            )}
          </div>

          {/* Détails */}
          <div className="glass-card rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-4">Détails du trajet</h2>
            <div className="space-y-4 relative">
              <div className="absolute left-[5px] top-3 bottom-12 w-[1.5px] bg-slate-700" />
              <div className="flex items-start gap-4">
                <div className="size-3 rounded-full bg-primary ring-4 ring-primary/20 z-10" />
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Départ</p>
                  <p className="text-white text-sm font-medium">{booking?.pickup}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="size-3 rounded-full border-2 border-white/60 z-10" />
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Destination</p>
                  <p className="text-white text-sm font-medium">{booking?.destination}</p>
                </div>
              </div>
            </div>
            <div className="border-t border-white/5 pt-4 mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Distance</span>
                <span className="text-white">{booking?.distance} km</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Durée estimée</span>
                <span className="text-white">{booking?.duration} min</span>
              </div>
              <div className="flex justify-between font-bold text-sm">
                <span className="text-white">Prix initial</span>
                <span className="text-primary">{booking?.price?.toLocaleString(DEFAULT_LOCALE, { minimumFractionDigits: 2 })} {CURRENCY_CODE}</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// Composant de page principal avec Suspense
export default function ConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 bg-primary rounded-full opacity-20 animate-ping" />
          <div className="relative w-16 h-16 bg-primary rounded-full flex items-center justify-center animate-pulse">
            <span className="material-symbols-outlined text-white text-[28px]">local_taxi</span>
          </div>
        </div>
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  );
}