/**
 * Composant MapView - Carte Google Maps Interactive
 * 
 * Affiche une carte Google Maps en plein écran avec localisation de l'utilisateur
 * et marqueurs personnalisés. Utilise @react-google-maps/api.
 * 
 * @component
 */

'use client';

import React, { useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { useCapacitorGeolocation } from '@/hooks/useCapacitorGeolocation';
import { Capacitor } from '@capacitor/core';
import { LoadingSpinner } from './LoadingSpinner';
import { MapFallback } from './MapFallback';
import dynamic from 'next/dynamic';

const NativeMapView = dynamic(() => import('./NativeMapView').then(mod => mod.NativeMapView), {
  ssr: false,
  loading: () => <LoadingSpinner size="lg" />
});

/**
 * Style de conteneur pour la carte (plein écran)
 */
const containerStyle = {
  width: '100%',
  height: '100%',
};

/**
 * Position par défaut (Toronto, Canada)
 */
const defaultCenter = {
  lat: 43.6532,
  lng: -79.3832,
};

interface MapViewProps {
  /** Centre initial de la carte */
  center?: { lat: number; lng: number };
  /** Niveau de zoom (1-20) */
  zoom?: number;
  /** Marqueurs à afficher sur la carte */
  markers?: Array<{
    id: string;
    position: { lat: number; lng: number };
    title?: string;
    icon?: string;
  }>;
  /** Callback quand la carte est cliquée */
  onMapClick?: (event: google.maps.MapMouseEvent | { latitude: number; longitude: number }) => void;
  /** Callback quand un marqueur est cliqué */
  onMarkerClick?: (markerId: string) => void;
  /** Afficher le bouton de recentrage */
  showRecenterButton?: boolean;
  /** Classe CSS personnalisée */
  className?: string;
}

/**
 * Composant MapView
 * 
 * Affiche une carte Google Maps interactive avec support des marqueurs
 * et de la localisation utilisateur.
 */
export const MapView: React.FC<MapViewProps> = ({
  center = defaultCenter,
  zoom = 13,
  markers = [],
  onMapClick,
  onMarkerClick,
  showRecenterButton = true,
  className = '',
}) => {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Charger l'API Google Maps
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    // Ne pas charger si la clé est vide pour éviter les erreurs
    ...(apiKey ? {} : { preventGoogleFontsLoading: true }),
  });

  /**
   * Callback quand la carte est chargée
   */
  const { getCurrentPosition } = useCapacitorGeolocation();

  /**
   * Callback quand la carte est chargée
   */
  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);

    // Obtenir la localisation de l'utilisateur
    getCurrentPosition()
      .then((position) => {
        if (position) {
          const pos = {
            lat: position.lat,
            lng: position.lng,
          };
          setUserLocation(pos);
          map.setCenter(pos);
        }
      })
      .catch((error) => {
        console.warn('Erreur de géolocalisation:', error);
      });
  }, [getCurrentPosition]);

  /**
   * Callback quand la carte est démontée
   */
  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  /**
   * Recentrer la carte sur la position de l'utilisateur
   */
  const recenterMap = () => {
    if (map && userLocation) {
      map.panTo(userLocation);
      map.setZoom(15);
    }
  };

  if (!apiKey) {
    return <MapFallback apiKey={apiKey} />;
  }

  if (loadError) {
    return <MapFallback error={loadError.message} apiKey={apiKey} />;
  }

  // Utiliser la carte native sur mobile
  if (Capacitor.isNativePlatform()) {
    return (
      <NativeMapView
        apiKey={apiKey}
        center={center}
        zoom={zoom}
        markers={markers}
        onMapClick={onMapClick as ((event: { latitude: number; longitude: number }) => void) | undefined}
        onMarkerClick={onMarkerClick}
        className={className}
      />
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-gray-600 mt-4">Chargement de la carte...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full ${className}`}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={zoom}
        onLoad={onLoad}
        onUnmount={onUnmount}
        onClick={onMapClick}
        options={{
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }],
            },
          ],
        }}
      >
        {/* Marqueur de position utilisateur */}
        {userLocation && (
          <Marker
            position={userLocation}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#4285F4',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            }}
          />
        )}

        {/* Marqueurs personnalisés */}
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={marker.position}
            title={marker.title}
            onClick={() => onMarkerClick?.(marker.id)}
            icon={marker.icon}
          />
        ))}
      </GoogleMap>

      {/* Bouton de recentrage */}
      {showRecenterButton && userLocation && (
        <button
          onClick={recenterMap}
          className="absolute bottom-24 right-4 bg-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
          aria-label="Recentrer sur ma position"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-gray-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      )}
    </div>
  );
};

