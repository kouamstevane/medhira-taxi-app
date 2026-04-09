"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { doc, getDoc, onSnapshot, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logger } from '@/utils/logger';
import { FiMessageSquare, FiEdit2 } from 'react-icons/fi';
import { Booking, CarType, Location, PlaceSuggestion } from '@/types/booking';
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from '@react-google-maps/api';
import { updateDestination, updatePassengerLocation, getCarTypes } from '@/services/taxi.service';
import { AddressInput } from './AddressInput';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { ChatModal } from '@/components/ChatModal';
import { InvoiceModal } from '@/components/InvoiceModal';
import { useCapacitorGeolocation } from '@/hooks/useCapacitorGeolocation';
import { CURRENCY_CODE, DEFAULT_PRICING, DEFAULT_LOCALE } from '@/utils/constants';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';

interface DriverFoundViewProps {
  bookingId: string;
  onComplete: () => void;
}

const containerStyle = {
  width: '100%',
  height: '300px'
};

const defaultCenter = {
  lat: 43.6532, // Toronto
  lng: -79.3832
};

export function DriverFoundView({ bookingId, onComplete }: DriverFoundViewProps) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showEditDestModal, setShowEditDestModal] = useState(false);
  const [newDestination, setNewDestination] = useState('');
  const [newDestLocation, setNewDestLocation] = useState<Location | null>(null);
  const [updatingDest, setUpdatingDest] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [completedBooking, setCompletedBooking] = useState<Booking | null>(null);
  const [realTimeDistance, setRealTimeDistance] = useState<number>(0); // En km
  const [realTimeDuration, setRealTimeDuration] = useState<number>(0); // En minutes
  const [activeCarType, setActiveCarType] = useState<CarType | null>(null);

  const [cancelling, setCancelling] = useState(false);
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);

  const { autocompleteService } = useGoogleMaps();
  const { watchPosition } = useCapacitorGeolocation();
  const { showError, showSuccess, toasts, removeToast } = useToast();

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
  });

  const onLoad = useCallback(function callback(_map: google.maps.Map) {
    // Map instance available if needed
  }, []);

  const onUnmount = useCallback(function callback(_map: google.maps.Map) {
    // Cleanup
  }, []);

  // Calculer l'itinéraire
  useEffect(() => {
    if (!isLoaded || !booking || !window.google) return;

    // Si on a déjà un itinéraire et que le statut n'a pas changé, on ne recalcule pas
    // sauf si on n'a pas encore de réponse (premier chargement)
    if (directionsResponse && booking.status === 'accepted' && booking.driverLocation) {
       // Pour la phase d'approche, on garde l'itinéraire initial pour éviter que la carte ne saute
       // Le marqueur du chauffeur bougera sur la carte, c'est suffisant
       return;
    }

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
      // En cours de route, on peut mettre à jour l'origine pour affiner le temps restant
      // Mais on va limiter les mises à jour pour la stabilité
      if (booking.driverLocation && booking.destinationLocation) { 
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
            // On ne met à jour que si c'est nécessaire pour éviter les clignotements
            setDirectionsResponse(result);
            
            // Extraire la distance et la durée en temps réel
            const route = result.routes[0];
            if (route && route.legs[0]) {
              const leg = route.legs[0];
              // Distance en km
              const distanceKm = (leg.distance?.value || 0) / 1000;
              // Durée en minutes
              const durationMin = Math.ceil((leg.duration?.value || 0) / 60);
              
              setRealTimeDistance(distanceKm);
              setRealTimeDuration(durationMin);
            }
          } else {
            console.error(`Directions request failed due to ${status}`);
          }
        }
      );
    }
  }, [
    isLoaded, 
    booking?.status, 
    // On retire driverLocation des dépendances directes pour éviter le recalcul à chaque tick GPS
    // On ne le garde que pour l'initialisation ou le changement de statut
    // booking?.driverLocation?.lat, 
    // booking?.driverLocation?.lng,
    booking?.pickupLocation?.lat,
    booking?.pickupLocation?.lng,
    booking?.destinationLocation?.lat,
    booking?.destinationLocation?.lng
  ]);


  const handleCancelBooking = async () => {
    setCancelling(true);
    try {
      const bookingRef = doc(db, 'bookings', bookingId);
      const bookingSnap = await getDoc(bookingRef);

      if (!bookingSnap.exists()) {
        showError('Réservation introuvable.');
        return;
      }

      const bookingData = bookingSnap.data();
      let cancellationFee = 0;

      // Calculer les pénalités si la course est en cours
      if (bookingData.status === 'in_progress') {
        const { calculateCancellationPenalty } = await import('@/services/taxi.service');
        cancellationFee = await calculateCancellationPenalty(bookingId);

        const confirmMsg = `Attention !\n\nVous êtes sur le point d'annuler une course en cours.\n\nPénalité d'annulation : ${cancellationFee.toLocaleString(DEFAULT_LOCALE, { minimumFractionDigits: 2 })} ${CURRENCY_CODE}\n\nVoulez-vous vraiment continuer ?`;

        if (!confirm(confirmMsg)) {
          setCancelling(false);
          return;
        }
      }

      // Utiliser cancelBooking du service qui libère aussi le chauffeur
      const { cancelBooking } = await import('@/services/taxi.service');
      await cancelBooking(bookingId, 'Annulé par le client');

      // Mettre à jour les champs supplémentaires
      await updateDoc(bookingRef, {
        cancelledBy: 'client',
        cancellationFee: cancellationFee,
      });

      // Débiter la pénalité du portefeuille si applicable
      if (cancellationFee > 0 && bookingData.userId) {
        try {
          const { debitCancellationPenalty } = await import('@/services/taxi.service');
          await debitCancellationPenalty(bookingId, bookingData.userId, cancellationFee);
        } catch (penaltyError) {
          logger.error('Erreur débit pénalité', { error: penaltyError });
        }
      }

      setShowCancelModal(false);

      if (cancellationFee > 0) {
        showError(`Course annulée.\n\nDes frais d'annulation de ${cancellationFee.toLocaleString(DEFAULT_LOCALE, { minimumFractionDigits: 2 })} ${CURRENCY_CODE} ont été débités de votre portefeuille.`);
      } else {
        showSuccess('Commande annulée avec succès.');
      }

      onComplete();
    } catch (error) {
      logger.error('Erreur lors de l\'annulation', { error, bookingId });
      showError('Erreur lors de l\'annulation. Veuillez réessayer.');
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
      showSuccess('Destination mise à jour avec succès ! Le prix a été recalculé.');
    } catch (error) {
      console.error('Erreur mise à jour destination:', error);
      showError('Erreur lors de la mise à jour de la destination.');
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
    if (!booking) return;
    if (!['accepted', 'driver_arrived', 'in_progress'].includes(booking.status)) return;

    const currentBookingId = booking.id;
    const stopWatch = watchPosition(
      location => {
        updatePassengerLocation(currentBookingId, {
          lat: location.lat,
          lng: location.lng,
        }).catch(error => {
          console.error('Erreur mise à jour position client:', error);
        });
      },
      { throttleMs: 2500, maxFrequencyHz: 0.5 }
    );

    return () => {
      stopWatch();
    };
  }, [booking, watchPosition]);

  // Charger le CarType réel pour le calcul de prix en temps réel
  useEffect(() => {
    if (!booking?.carType) return;
    getCarTypes().then(types => {
      const matched = types.find(ct => ct.name === booking.carType) || types[0];
      if (matched) setActiveCarType(matched);
    }).catch(err => logger.error('Erreur chargement CarType', { error: err }));
  }, [booking?.carType]);

  useEffect(() => {
    const bookingRef = doc(db, 'bookings', bookingId);
    const unsubscribe = onSnapshot(bookingRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const currentBooking = { id: snapshot.id, ...data } as Booking;
          setBooking(currentBooking);
          setLoading(false);
          
          // Quand la course est terminée, afficher le modal de facture
          if (data.status === 'completed' && !showInvoiceModal && !completedBooking) {
            setCompletedBooking(currentBooking);
            setShowInvoiceModal(true);
          }
        }
      },
      (error) => {
        logger.error('Erreur lors du chargement du booking', { error, bookingId });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [bookingId, showInvoiceModal, completedBooking]);

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
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
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
                  suppressMarkers: true,
                  preserveViewport: true, // Empêche le re-centrage automatique
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
                  url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png"
                }}
              />
            )}

             {/* Marqueur Destination */}
             {booking.destinationLocation && (
              <Marker
                position={booking.destinationLocation}
                icon={{
                  url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png"
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
              <div className="inline-block bg-blue-50 border border-blue-200 px-3 py-1 rounded text-sm font-mono font-bold mt-1 text-blue-900">
                {booking.carPlate}
              </div>
            </div>
          </div>
          <div className="flex space-x-2">
            <button 
              onClick={() => setShowChat(true)}
              className="p-3 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition relative"
              title="Messagerie"
            >
              <FiMessageSquare className="w-5 h-5" />
              {/* Indicateur de message non lu */}
              {(booking.unreadMessages?.client || 0) > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-white">
                  {booking.unreadMessages?.client}
                </span>
              )}
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

        {/* Suivi en temps réel (course en cours) */}
        {booking.status === 'in_progress' && realTimeDistance > 0 && (
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
            <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center">
              <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Suivi en temps réel
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Distance restante</p>
                <p className="text-lg font-bold text-blue-600">{realTimeDistance.toFixed(1)} km</p>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Temps estimé</p>
                <p className="text-lg font-bold text-blue-600">{realTimeDuration} min</p>
              </div>
            </div>
            <div className="mt-3 bg-white rounded-lg p-3 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Estimation tarifaire</p>
              <p className="text-xl font-bold text-green-600">
                {(() => {
                  // Convertir Timestamp Firestore correctement
                  let startTime: Date;
                   if (booking.startedAt && typeof (booking.startedAt as unknown as { toDate?: unknown }).toDate === 'function') {
                    startTime = (booking.startedAt as Timestamp).toDate();
                  } else if (booking.startedAt instanceof Date) {
                    startTime = booking.startedAt;
                  } else {
                    startTime = new Date();
                  }
                  const elapsedMinutes = Math.ceil((new Date().getTime() - startTime.getTime()) / 60000);

                  const distanceTraveled = Math.max(0, booking.distance - realTimeDistance);

                  // Utiliser les vrais tarifs du CarType
                  const basePrice = activeCarType?.basePrice ?? DEFAULT_PRICING.BASE_PRICE;
                  const pricePerKm = activeCarType?.pricePerKm ?? DEFAULT_PRICING.PRICE_PER_KM;
                  const pricePerMin = activeCarType?.pricePerMinute ?? DEFAULT_PRICING.PRICE_PER_MINUTE;

                  const estimatedPrice = basePrice + (distanceTraveled * pricePerKm) + (elapsedMinutes * pricePerMin);

                  return `${estimatedPrice.toLocaleString(DEFAULT_LOCALE, { minimumFractionDigits: 2 })} ${CURRENCY_CODE}`;
                })()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Estimation basée sur le trajet en cours
              </p>
            </div>
          </div>
        )}

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
                Le prix sera recalculé en fonction de la nouvelle destination.
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
      {/* Modal de Chat */}
      {showChat && booking.driverId && (
        <ChatModal
          bookingId={bookingId}
          driverName={booking.driverName || 'Chauffeur'}
          driverId={booking.driverId}
          userType="client"
          onClose={() => setShowChat(false)}
        />
      )}
      
      {/* Modal de Facture - affiché quand la course est terminée */}
      {showInvoiceModal && completedBooking && (
        <InvoiceModal
          booking={completedBooking}
          onClose={() => {
            setShowInvoiceModal(false);
            onComplete();
          }}
        />
      )}
    </>
  );
}
