'use client'

import { LoadScript, GoogleMap, Marker } from '@react-google-maps/api'

const mapContainerStyle = { width: '100%', height: '300px' }
const defaultCenter = { lat: 43.6532, lng: -79.3832 }

interface TrackingMapProps {
  driverLocation: { lat: number; lng: number } | null
  restaurantAddress?: { lat: number; lng: number }
  clientAddress?: { lat: number; lng: number }
}

export default function TrackingMap({ driverLocation, restaurantAddress, clientAddress }: TrackingMapProps) {
  const center = driverLocation || clientAddress || defaultCenter

  return (
    <LoadScript
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
      libraries={['geometry', 'places']}
    >
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={14}
        options={{
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
        }}
      >
        {driverLocation && (
          <Marker
            position={{ lat: driverLocation.lat, lng: driverLocation.lng }}
            icon={{
              url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
              scaledSize: new google.maps.Size(40, 40),
            }}
          />
        )}
        {restaurantAddress && (
          <Marker
            position={{ lat: restaurantAddress.lat, lng: restaurantAddress.lng }}
            label="R"
          />
        )}
        {clientAddress && (
          <Marker
            position={{ lat: clientAddress.lat, lng: clientAddress.lng }}
            icon={{
              url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
              scaledSize: new google.maps.Size(40, 40),
            }}
            label="D"
          />
        )}
      </GoogleMap>
    </LoadScript>
  )
}
