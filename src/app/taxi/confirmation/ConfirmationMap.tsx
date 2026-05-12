"use client";

import { useState, useEffect } from "react";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";

const mapContainerStyle = { width: "100%", height: "200px" };
const defaultCenter = { lat: 43.6532, lng: -79.3832 };

interface ConfirmationMapProps {
  /** Position brute (basse fréquence) — sert pour les calculs externes. */
  driverLocation: { lat: number; lng: number } | null;
  /** Position lissée optionnelle pour le marker (haute fréquence, fluide). */
  driverMarkerLocation?: { lat: number; lng: number } | null;
  pickupLocation?: { lat: number; lng: number };
  directions: google.maps.DirectionsResult | null;
}

export function ConfirmationMap({ driverLocation, driverMarkerLocation, pickupLocation, directions }: ConfirmationMapProps) {
  const markerPosition = driverMarkerLocation ?? driverLocation;
  const { isLoaded } = useGoogleMaps();
  const [mapsApi, setMapsApi] = useState<any>(null);

  // Center figé : on prend la 1re position disponible et on n'en change plus.
  // Évite que la map saute à chaque tick GPS Firestore.
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (center) return;
    const initial = driverLocation || pickupLocation || null;
    if (initial) setCenter(initial);
  }, [center, driverLocation, pickupLocation]);

  useEffect(() => {
    import("@react-google-maps/api").then(setMapsApi);
  }, []);

  if (!isLoaded || !mapsApi) {
    return (
      <div style={mapContainerStyle} className="flex items-center justify-center bg-[#1A1A1A]">
        <p className="text-[#9CA3AF]">Chargement de la carte...</p>
      </div>
    );
  }

  const { GoogleMap, Marker, DirectionsRenderer } = mapsApi;

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center || defaultCenter}
      zoom={14}
    >
      {pickupLocation && (
        <Marker position={pickupLocation} label="P" />
      )}
      {markerPosition && (
        <Marker
          position={markerPosition}
          icon={{
            url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            scaledSize: new google.maps.Size(40, 40)
          }}
        />
      )}
      {directions && (
        <DirectionsRenderer
          options={{
            polylineOptions: { strokeColor: "#f29200", strokeWeight: 5 },
            suppressMarkers: true
          }}
          directions={directions}
        />
      )}
    </GoogleMap>
  );
}
