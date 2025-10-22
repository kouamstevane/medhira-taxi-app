"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { LoadScript, GoogleMap, Marker, DirectionsRenderer } from "@react-google-maps/api";

const mapContainerStyle = { width: "100%", height: "200px" };
const defaultCenter = { lat: 3.848, lng: 11.5021 }; // Yaoundé

// Composant principal qui utilise useSearchParams
function ConfirmationContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("bookingId");

  const [booking, setBooking] = useState<any>(null);
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
      (docSnap) => {
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
          }, 60000);
        }

        if (data.status === "accepted" && data.driverId) {
          // Charger la position du chauffeur
          const driverRef = doc(db, "drivers", data.driverId);
          const unsubscribeDriver = onSnapshot(driverRef, (driverSnap) => {
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
      (err) => {
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

  const calculateDistance = (loc1: any, loc2: any) => {
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
      <div className="min-h-screen bg-[#e6e6e6] flex flex-col items-center justify-center p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f29200] mb-4"></div>
        <h2 className="text-xl font-bold text-[#101010]">Chargement...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#e6e6e6] flex flex-col items-center justify-center p-6">
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded mb-4 w-full max-w-md text-center">
          <p>{error}</p>
        </div>
        <button
          onClick={() => window.history.back()}
          className="bg-[#f29200] text-white px-6 py-2 rounded-lg font-bold"
        >
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#e6e6e6]">
      <header className="bg-[#101010] text-white p-4">
        <h1 className="text-xl font-bold">Suivi de course</h1>
      </header>

      <main className="p-4 pt-6">
        {/* Carte */}
        <div className="mb-6 rounded-xl overflow-hidden shadow-lg">
          <LoadScript 
            googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}
            libraries={["geometry", "places"]}
          >
            <GoogleMap 
              mapContainerStyle={mapContainerStyle} 
              center={driverLocation || defaultCenter} 
              zoom={14}
            >
              {booking?.pickupLocation && (
                <Marker position={booking.pickupLocation} label="P" />
              )}
              {driverLocation && (
                <Marker 
                  position={driverLocation} 
                  icon={{
                    url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
                    scaledSize: new google.maps.Size(40, 40)
                  }} 
                />
              )}
              {directions && (
                <DirectionsRenderer
                  options={{
                    polylineOptions: { strokeColor: "#0000FF", strokeWeight: 5 },
                    suppressMarkers: true
                  }}
                  directions={directions}
                />
              )}
            </GoogleMap>
          </LoadScript>
        </div>

        {/* Notification d'arrivée */}
        {showArrival && (
          <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4 rounded">
            <p>✅ Votre chauffeur est arrivé !</p>
          </div>
        )}

        {/* Statut */}
        <div className="bg-white rounded-2xl p-6 shadow-lg mb-6">
          <h2 className="text-xl font-bold text-[#101010] mb-4">Statut de la course</h2>

          {booking?.status === "pending" && (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f29200] mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold">Recherche d'un chauffeur</h3>
              <p className="text-gray-600">En attente...</p>
            </div>
          )}

          {booking?.status === "accepted" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Chauffeur en route</h3>
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">En route</span>
              </div>
              <p><strong>Temps estimé :</strong> {getEstimatedArrivalTime()}</p>
              {booking.driverName && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p><strong>Chauffeur :</strong> {booking.driverName}</p>
                  <p><strong>Véhicule :</strong> {booking.carColor} {booking.carModel} ({booking.carPlate})</p>
                  <p><strong>Téléphone :</strong> {booking.driverPhone}</p>
                </div>
              )}
            </div>
          )}

          {booking?.status === "arrived" && (
            <div className="text-center py-6">
              <div className="text-green-500 text-4xl mb-2">✅</div>
              <h3 className="text-lg font-semibold">Chauffeur arrivé</h3>
              <p>Votre chauffeur vous attend au point de départ.</p>
            </div>
          )}

          {booking?.status === "in_progress" && (
            <div className="text-center py-6">
              <div className="animate-pulse text-green-500 text-4xl mb-2">🚗</div>
              <h3 className="text-lg font-semibold">Course en cours</h3>
              <p>Destination : {booking?.destination}</p>
            </div>
          )}

          {booking?.status === "completed" && finalPrice && (
            <div className="text-center py-6">
              <div className="text-green-500 text-4xl mb-2">🎉</div>
              <h3 className="text-lg font-semibold">Course terminée</h3>
              <p className="text-2xl font-bold text-[#f29200] mt-2">{finalPrice} FCFA</p>
              <p className="text-gray-600 mt-1">Merci d'avoir utilisé Medjira Taxi</p>
            </div>
          )}
        </div>

        {/* Détails */}
        <div className="bg-white rounded-2xl p-6 shadow-lg">
          <h2 className="text-xl font-bold text-[#101010] mb-4">Détails du trajet</h2>
          <div className="space-y-3">
            <div className="flex items-start">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3"></div>
              <span>{booking?.pickup}</span>
            </div>
            <div className="flex items-start">
              <div className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3"></div>
              <span>{booking?.destination}</span>
            </div>
            <div className="border-t pt-3 mt-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Distance</span>
                <span>{booking?.distance} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Durée estimée</span>
                <span>{booking?.duration} min</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Prix initial</span>
                <span>{booking?.price} FCFA</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Composant de page principal avec Suspense
export default function ConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#e6e6e6] flex flex-col items-center justify-center p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f29200] mb-4"></div>
        <h2 className="text-xl font-bold text-[#101010]">Chargement...</h2>
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  );
}