"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logger } from '@/utils/logger';
import { FiPhone, FiMessageSquare, FiEdit2 } from 'react-icons/fi';
import { Booking, Location, PlaceSuggestion } from '@/types/booking';
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from '@react-google-maps/api';
import { updateDestination } from '@/services/taxi.service';
import { AddressInput } from './AddressInput';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';

interface DriverFoundViewProps {
  bookingId: string;
  onComplete: () => void;
}

const containerStyle = {
  width: '100%',
  height: '300px'
};

const defaultCenter = {
  lat: 4.0511, // Douala
  lng: 9.7679
};

export function DriverFoundView({ bookingId, onComplete }: DriverFoundViewProps) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showEditDestModal, setShowEditDestModal] = useState(false);
  const [newDestination, setNewDestination] = useState('');
  const [newDestLocation, setNewDestLocation] = useState<Location | null>(null);
  const [updatingDest, setUpdatingDest] = useState(false);
  
  const [cancelling, setCancelling] = useState(false);
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const { autocompleteService } = useGoogleMaps();

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
  });

  const onLoad = useCallback(function callback(map: google.maps.Map) {
    setMap(map);
  }, []);

  const onUnmount = useCallback(function callback(map: google.maps.Map) {
    setMap(null);
  }, []);

  // Calculer l'itinéraire quand les positions changent
  useEffect(() => {
    if (!isLoaded || !booking || !window.google) return;

    const directionsService = new window.google.maps.DirectionsService();

    // Déterminer les points de départ et d'arrivée selon le statut
    let origin: google.maps.LatLngLiteral | undefined;
    let destination: google.maps.LatLngLiteral | undefined;

    if (booking.status === 'accepted' || booking.status === 'driver_arrived') {
      // Chauffeur vers Client
      if (booking.driverLocation && booking.pickupLocation) {
        origin = booking.driverLocation;
        destination = booking.pickupLocation;
      }
    } else if (booking.status === 'in_progress') {
      // Client vers Destination (ou Chauffeur vers Destination)
      if (booking.driverLocation && booking.destinationLocation) { // Priorité à la loc chauffeur
         origin = booking.driverLocation;
         destination = booking.destinationLocation;
      } else if (booking.pickupLocation && booking.destinationLocation) {
        origin = booking.pickupLocation;
        destination = booking.destinationLocation;
      }
    }

    if (origin && destination) {
      directionsService.route(
        {
          origin,
          destination,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === 'OK' && result) {
            setDirectionsResponse(result);
          } else {
            console.error(`Directions request failed due to ${status}`);
          }
        }
      );
    }
  }, [isLoaded, booking?.status, booking?.driverLocation, booking?.pickupLocation, booking?.destinationLocation]);


  const handleCancelBooking = async () => {
    setCancelling(true);
    try {
      const bookingRef = doc(db, 'bookings', bookingId);
      
      await updateDoc(bookingRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: 'client',
        updatedAt: serverTimestamp(),
      });
      
      setShowCancelModal(false);
      alert('✅ Commande annulée avec succès.');
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1000);
    } catch (error) {
      console.error('[CLIENT] ❌ Erreur lors de l\'annulation:', error);
      alert('❌ Erreur lors de l\'annulation. Veuillez réessayer.');
    } finally {
      setCancelling(false);
    }
  };

  const handleUpdateDestination = async () => {
    if (!newDestination || !booking) return;
    setUpdatingDest(true);
    try {
      await updateDestination(booking.id, newDestination, newDestLocation || undefined);
      setShowEditDestModal(false);
      setNewDestination('');
      setNewDestLocation(null);
      alert('✅ Destination mise à jour avec succès ! Le prix a été recalculé.');
    } catch (error) {
      console.error('Erreur mise à jour destination:', error);
      alert('❌ Erreur lors de la mise à jour de la destination.');
    } finally {
      setUpdatingDest(false);
    }
  };

  const handleDestinationSelect = (suggestion: PlaceSuggestion) => {
    setNewDestination(suggestion.description);
    if (window.google && window.google.maps) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ placeId: suggestion.place_id }, (results, status) => {
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          setNewDestLocation({
            lat: results[0].geometry.location.lat(),
            lng: results[0].geometry.location.lng(),
          });
        }
      });
    }
  };

  useEffect(() => {
    const bookingRef = doc(db, 'bookings', bookingId);
    const unsubscribe = onSnapshot(bookingRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setBooking({ id: snapshot.id, ...data } as Booking);
          setLoading(false);
          
          if (data.status === 'completed') {
            onComplete();
          }
        }
      },
      (error) => {
        logger.error('Erreur lors du chargement du booking', { error, bookingId });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [bookingId, onComplete]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f29200] mx-auto mb-4"></div>
        <p className="text-gray-600">Chargement du suivi...</p>
      </div>
    );
  }

  if (!booking) return null;

  const getStatusMessage = () => {
    switch (booking.status) {
      case 'accepted': return 'Chauffeur en route';
      case 'driver_arrived': return 'Chauffeur arrivé !';
      case 'in_progress': return 'En route vers destination';
      default: return 'Statut inconnu';
    }
  };

  const getStatusColor = () => {
    switch (booking.status) {
      case 'accepted': return 'bg-blue-500';
      case 'driver_arrived': return 'bg-green-500 animate-pulse';
      case 'in_progress': return 'bg-[#f29200]';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Carte */}
      <div className="relative h-[300px] sm:h-[400px] bg-gray-100">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={booking.driverLocation || booking.pickupLocation || defaultCenter}
            zoom={15}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={{
              disableDefaultUI: true,
              zoomControl: true,
            }}
          >
            {/* Directions */}
            {directionsResponse && (
              <DirectionsRenderer
                options={{
                  directions: directionsResponse,
                  suppressMarkers: true, // On utilise nos propres marqueurs
                  polylineOptions: {
                    strokeColor: '#f29200',
                    strokeWeight: 5,
                  },
                }}
              />
            )}

            {/* Marqueur Chauffeur */}
            {booking.driverLocation && (
              <Marker
                position={booking.driverLocation}
                icon={{
                  path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 6,
                  fillColor: "#000000",
                  fillOpacity: 1,
                  strokeWeight: 2,
                  strokeColor: "#FFFFFF",
                  rotation: 0, // Idéalement on devrait avoir le heading du chauffeur
                }}
                label={{ text: "🚕", className: "text-2xl" }}
              />
            )}

            {/* Marqueur Pickup */}
            {booking.pickupLocation && (
              <Marker
                position={booking.pickupLocation}
                icon={{
                  url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
                }}
              />
            )}

             {/* Marqueur Destination */}
             {booking.destinationLocation && (
              <Marker
                position={booking.destinationLocation}
                icon={{
                  url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p>Chargement de la carte...</p>
          </div>
        )}
        
        {/* Badge Statut Flottant */}
        <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 px-6 py-2 rounded-full text-white font-bold shadow-lg ${getStatusColor()}`}>
          {getStatusMessage()}
        </div>
      </div>

      {/* Infos Chauffeur et Course */}
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-gray-200 rounded-full flex items-center justify-center text-2xl">
              👨‍✈️
            </div>
            <div>
              <h3 className="font-bold text-lg text-gray-900">{booking.driverName}</h3>
              <p className="text-sm text-gray-500">
                {booking.carModel} • {booking.carColor}
              </p>
              <div className="inline-block bg-gray-100 px-2 py-0.5 rounded text-xs font-mono font-bold mt-1">
                {booking.carPlate}
              </div>
            </div>
          </div>
          <div className="flex space-x-2">
            <button className="p-3 bg-green-100 text-green-600 rounded-full hover:bg-green-200 transition">
              <FiPhone className="w-5 h-5" />
            </button>
            <button className="p-3 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition">
              <FiMessageSquare className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Détails Trajet */}
        <div className="space-y-4 border-t border-gray-100 pt-4">
          <div className="flex items-start">
            <div className="flex flex-col items-center mr-3 mt-1">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <div className="w-0.5 h-8 bg-gray-200 my-1"></div>
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            </div>
            <div className="flex-1 space-y-6">
              <div>
                <p className="text-xs text-gray-500 uppercase">Départ</p>
                <p className="font-medium text-gray-900">{booking.pickup}</p>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 uppercase">Destination</p>
                  {booking.status === 'in_progress' && (
                    <button 
                      onClick={() => setShowEditDestModal(true)}
                      className="text-xs text-[#f29200] font-medium flex items-center hover:underline"
                    >
                      <FiEdit2 className="mr-1" /> Modifier
                    </button>
                  )}
                </div>
                <p className="font-medium text-gray-900">{booking.destination}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 pt-4 border-t border-gray-100">
           {booking.status !== 'in_progress' && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="w-full py-3 text-red-500 font-medium hover:bg-red-50 rounded-lg transition"
            >
              Annuler la course
            </button>
           )}
           {booking.status === 'in_progress' && (
             <p className="text-center text-sm text-gray-500 italic">
               Course en cours... Détendez-vous ! 🎵
             </p>
           )}
        </div>
      </div>

       {/* Modal de confirmation d'annulation */}
       {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">Annuler ?</h3>
            <p className="text-gray-600 text-sm text-center mb-6">
              Le chauffeur est déjà en route. Des frais peuvent s&apos;appliquer.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleCancelBooking}
                disabled={cancelling}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg"
              >
                {cancelling ? '...' : 'Oui, annuler'}
              </button>
              <button
                onClick={() => setShowCancelModal(false)}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-lg"
              >
                Non, retour
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de modification de destination */}
      {showEditDestModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Modifier la destination</h3>
            
            <div className="mb-6">
              <AddressInput
                label="Nouvelle adresse"
                value={newDestination}
                onChange={setNewDestination}
                onSelect={handleDestinationSelect}
                placeholder="Où voulez-vous aller ?"
                autocompleteService={autocompleteService}
                required
              />
              <p className="text-xs text-gray-500 mt-2">
                ⚠️ Le prix sera recalculé en fonction de la nouvelle destination.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleUpdateDestination}
                disabled={updatingDest || !newDestination}
                className="w-full bg-[#f29200] hover:bg-[#e68600] text-white font-bold py-3 px-4 rounded-lg disabled:opacity-50"
              >
                {updatingDest ? 'Mise à jour...' : 'Confirmer la nouvelle destination'}
              </button>
              <button
                onClick={() => setShowEditDestModal(false)}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-lg"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
