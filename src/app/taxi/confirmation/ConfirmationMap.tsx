"use client";

import { LoadScript, GoogleMap, Marker, DirectionsRenderer } from "@react-google-maps/api";

const mapContainerStyle = { width: "100%", height: "200px" };
const defaultCenter = { lat: 43.6532, lng: -79.3832 };

interface ConfirmationMapProps {
  driverLocation: { lat: number; lng: number } | null;
  pickupLocation?: { lat: number; lng: number };
  directions: google.maps.DirectionsResult | null;
}

export function ConfirmationMap({ driverLocation, pickupLocation, directions }: ConfirmationMapProps) {
  return (
    <LoadScript
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}
      libraries={["geometry", "places"]}
    >
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={driverLocation || defaultCenter}
        zoom={14}
      >
        {pickupLocation && (
          <Marker position={pickupLocation} label="P" />
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
              polylineOptions: { strokeColor: "#f29200", strokeWeight: 5 },
              suppressMarkers: true
            }}
            directions={directions}
          />
        )}
      </GoogleMap>
    </LoadScript>
  );
}
