"use client";
import dynamic from 'next/dynamic';
import { useState, useMemo } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { ChatModal } from '@/components/ChatModal';
import { CURRENCY_CODE } from '@/utils/constants';
import { formatCurrencyWithCode } from '@/utils/format';
import type { Trip } from '@/types/trip';

const MapView = dynamic(() => import('@/components/ui').then(mod => ({ default: mod.MapView })), { ssr: false, loading: () => <div className="w-full h-56 bg-gray-100 animate-pulse rounded-xl" /> })

interface CurrentTripCardProps {
  trip: Trip;
  onMarkAsArrived: (tripId: string) => void;
  onStartTrip: (tripId: string) => void;
  onCompleteTrip: (tripId: string) => void;
}

export function CurrentTripCard({
  trip,
  onMarkAsArrived,
  onStartTrip,
  onCompleteTrip,
}: CurrentTripCardProps) {
  const [showChat, setShowChat] = useState(false);

  const passengerPosition = useMemo(() => {
    if (trip.passengerLocation) {
      return { lat: trip.passengerLocation.lat, lng: trip.passengerLocation.lng };
    }
    if (trip.pickupLocation) {
      return { lat: trip.pickupLocation.lat, lng: trip.pickupLocation.lng };
    }
    return null;
  }, [trip.passengerLocation, trip.pickupLocation]);

  const destinationPosition = useMemo(() => {
    if (trip.destinationLocation) {
      return { lat: trip.destinationLocation.lat, lng: trip.destinationLocation.lng };
    }
    return null;
  }, [trip.destinationLocation]);

  const mapMarkers = useMemo(() => {
    const markers: Array<{
      id: string;
      position: { lat: number; lng: number };
      title?: string;
      icon?: string;
    }> = [];

    if (passengerPosition) {
      markers.push({
        id: 'passenger',
        position: passengerPosition,
        title: 'Client',
        icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
      });
    }

    if (destinationPosition) {
      markers.push({
        id: 'destination',
        position: destinationPosition,
        title: 'Destination',
        icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
      });
    }

    return markers;
  }, [passengerPosition, destinationPosition]);

  const mapCenter = passengerPosition || destinationPosition || undefined;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'Acceptée';
      case 'driver_arrived':
        return 'Arrivé';
      case 'in_progress':
        return 'En cours';
      default:
        return status;
    }
  };

  return (
    <div className="lg:col-span-2">
      <div className="glass-card rounded-2xl p-4 sm:p-6 border border-white/5">
        <h2 className="text-xl font-bold text-white mb-4">Course en cours</h2>
        {mapCenter && (
          <div className="mb-4 h-56 rounded-xl overflow-hidden">
            <MapView
              center={mapCenter}
              zoom={14}
              markers={mapMarkers}
              showRecenterButton={false}
              className="w-full h-full"
            />
          </div>
        )}
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold text-white">Client</p>
              <p className="text-sm text-slate-300 truncate">{trip.pickup}</p>
              <p className="text-sm text-slate-300">&rarr; {trip.destination}</p>
            </div>
            <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-sm">
              {getStatusLabel(trip.status)}
            </span>
          </div>
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center flex-1 min-w-0">
                <MaterialIcon name="location_on" size="sm" className="text-green-400 mr-3 flex-shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm text-slate-300 block truncate">{trip.pickup}</span>
                  {/* Indicateur de précision GPS */}
                  {trip.pickupLocation && (
                    <span className={`text-xs flex items-center gap-1 ${
                      (trip.pickupLocationAccuracy || trip.pickupLocation.accuracy || 0) <= 20
                        ? 'text-green-400'
                        : (trip.pickupLocationAccuracy || trip.pickupLocation.accuracy || 0) <= 50
                          ? 'text-yellow-400'
                          : 'text-orange-400'
                    }`}>
                      <MaterialIcon name="navigation" size="sm" className="text-inherit" />
                      GPS {(trip.pickupLocationAccuracy || trip.pickupLocation.accuracy || 0) <= 20 ? 'Très précis' :
                           (trip.pickupLocationAccuracy || trip.pickupLocation.accuracy || 0) <= 50 ? 'Précis' :
                           'Approximatif'}
                      {trip.pickupLocationAccuracy && ` (±${Math.round(trip.pickupLocationAccuracy)}m)`}
                    </span>
                  )}
                </div>
              </div>
              {/* Navigation vers le point de départ (quand accepté) - UTILISE LES COORDONNÉES PRÉCISES */}
              {trip.status === 'accepted' && (
                <button
                  onClick={() => {
                    // Priorité aux coordonnées GPS précises pour la navigation
                    if (trip.pickupLocation) {
                      // Navigation avec coordonnées GPS ultra-précises
                      const { lat, lng } = trip.pickupLocation;
                      // Utiliser Google Maps avec coordonnées directes pour une navigation précise
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank');
                    } else {
                      // Fallback sur l'adresse texte
                      const query = encodeURIComponent(trip.pickup);
                      window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
                    }
                  }}
                  className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center ml-2 transition-all"
                >
                  <MaterialIcon name="navigation" size="sm" className="mr-1" />
                  <span>Naviguer</span>
                </button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <MaterialIcon name="location_on" size="sm" className="text-red-400 mr-3" />
                <span className="text-sm text-slate-300">{trip.destination}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Navigation vers la destination (quand course démarrée) */}
                {(trip.status === 'driver_arrived' || trip.status === 'in_progress') && (
                  <button
                    onClick={() => {
                       const query = encodeURIComponent(trip.destination);
                       window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
                    }}
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center"
                  >
                    <span className="mr-1">Naviguer</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </button>
                )}
                <button
                  onClick={() => setShowChat(true)}
                  className="text-primary hover:text-[#ffae33] text-sm font-medium flex items-center relative"
                >
                  <MaterialIcon name="chat" size="sm" className="mr-1" />
                  <span>Chat</span>
                  {(trip.unreadMessages?.driver || 0) > 0 && (
                    <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-background">
                      {trip.unreadMessages?.driver}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-lg font-bold text-white">{formatCurrencyWithCode(trip.price)}</span>
            <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
              {trip.status === 'accepted' && (
                <button
                  onClick={() => onMarkAsArrived(trip.id)}
                  className="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white px-4 py-2 sm:px-3 sm:py-1 rounded text-sm flex items-center justify-center space-x-1 sm:space-x-2 transition touch-manipulation"
                  style={{ minHeight: '44px' }}
                >
                  <MaterialIcon name="check_circle" size="sm" />
                  <span>Je suis arrivé</span>
                </button>
              )}
              {trip.status === 'driver_arrived' && (
                <button
                  onClick={() => onStartTrip(trip.id)}
                  className="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white px-4 py-2 sm:px-3 sm:py-1 rounded text-sm flex items-center justify-center space-x-1 sm:space-x-2 transition touch-manipulation"
                  style={{ minHeight: '44px' }}
                >
                  <MaterialIcon name="play_arrow" size="sm" />
                  <span>Démarrer</span>
                </button>
              )}
              {trip.status === 'in_progress' && (
                <button
                  onClick={() => onCompleteTrip(trip.id)}
                  className="bg-red-500 hover:bg-red-600 active:bg-red-700 text-white px-4 py-2 sm:px-3 sm:py-1 rounded text-sm flex items-center justify-center space-x-1 sm:space-x-2 transition touch-manipulation"
                  style={{ minHeight: '44px' }}
                >
                  <MaterialIcon name="check_circle" size="sm" />
                  <span>Terminer</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {showChat && (
        <ChatModal
          bookingId={trip.id}
          driverName="Client" // Le nom du client n'est pas toujours dispo ici, on met "Client" par défaut
          driverId={trip.userId} // C'est l'ID de l'autre partie
          userType="chauffeur"
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
}
