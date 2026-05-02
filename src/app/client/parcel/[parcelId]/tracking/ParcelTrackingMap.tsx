'use client'

import { useEffect, useState } from 'react'
import { useGoogleMaps } from '@/hooks/useGoogleMaps'

const mapContainerStyle = { width: '100%', height: '320px' }
const defaultCenter = { lat: 3.848, lng: 11.502 } // Yaoundé fallback

interface LatLng { lat: number; lng: number }

interface Props {
  driverLocation: LatLng | null
  pickup: LatLng
  dropoff: LatLng
}

type MapsApi = typeof import('@react-google-maps/api')

export default function ParcelTrackingMap({ driverLocation, pickup, dropoff }: Props) {
  const center = driverLocation || pickup || dropoff || defaultCenter
  const { isLoaded } = useGoogleMaps()
  const [mapsApi, setMapsApi] = useState<MapsApi | null>(null)

  useEffect(() => {
    import('@react-google-maps/api').then((m) => setMapsApi(m))
  }, [])

  if (!isLoaded || !mapsApi) {
    return (
      <div style={mapContainerStyle} className="flex items-center justify-center bg-[#1A1A1A]">
        <p className="text-slate-400 text-sm">Chargement de la carte…</p>
      </div>
    )
  }

  const { GoogleMap, Marker } = mapsApi

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center}
      zoom={13}
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
          position={driverLocation}
          icon={{
            url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
            scaledSize: new google.maps.Size(40, 40),
          }}
        />
      )}
      <Marker
        position={pickup}
        icon={{
          url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
          scaledSize: new google.maps.Size(40, 40),
        }}
        label={{ text: 'P', color: '#fff', fontWeight: 'bold' }}
      />
      <Marker
        position={dropoff}
        icon={{
          url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
          scaledSize: new google.maps.Size(40, 40),
        }}
        label={{ text: 'D', color: '#fff', fontWeight: 'bold' }}
      />
    </GoogleMap>
  )
}
