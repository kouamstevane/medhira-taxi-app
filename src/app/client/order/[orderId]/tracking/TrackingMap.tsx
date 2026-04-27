'use client'

import { useState, useEffect } from 'react'
import { useGoogleMaps } from '@/hooks/useGoogleMaps'

const mapContainerStyle = { width: '100%', height: '300px' }
const defaultCenter = { lat: 43.6532, lng: -79.3832 }

interface TrackingMapProps {
  driverLocation: { lat: number; lng: number } | null
  restaurantAddress?: { lat: number; lng: number }
  clientAddress?: { lat: number; lng: number }
}

export default function TrackingMap({ driverLocation, restaurantAddress, clientAddress }: TrackingMapProps) {
  const center = driverLocation || clientAddress || defaultCenter
  const { isLoaded } = useGoogleMaps()
  const [mapsApi, setMapsApi] = useState<any>(null)

  useEffect(() => {
    import('@react-google-maps/api').then(setMapsApi)
  }, [])

  if (!isLoaded || !mapsApi) {
    return (
      <div style={mapContainerStyle} className="flex items-center justify-center bg-[#1A1A1A]">
        <p className='text-[#9CA3AF]'>Chargement de la carte...</p>
      </div>
    )
  }

  const { GoogleMap, Marker } = mapsApi

  return (
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
  )
}
