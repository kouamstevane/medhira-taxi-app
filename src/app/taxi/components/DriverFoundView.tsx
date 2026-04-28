"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { doc, getDoc, onSnapshot, serverTimestamp, Timestamp, type DocumentData } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logger } from '@/utils/logger';
import { MessageSquare, Pencil } from 'lucide-react';
import { Booking, CarType, Location, PlaceSuggestion } from '@/types/booking';
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
  const [cancellationFee, setCancellationFee] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [mapsApi, setMapsApi] = useState<any>(null);

  const { autocompleteService } = useGoogleMaps();
  const { watchPosition } = useCapacitorGeolocation();
  const { showError, showSuccess, toasts, removeToast } = useToast();

  const { isLoaded } = useGoogleMaps();

  useEffect(() => {
    import('@react-google-maps/api').then(setMapsApi);
  }, []);

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

      if (bookingData.status === 'in_progress') {
        const { calculateCancellationPenalty } = await import('@/services/taxi.service');
        const fee = await calculateCancellationPenalty(bookingId);
        setCancellationFee(fee);
        setShowCancelConfirm(true);
        setCancelling(false);
        return;
      }

      await executeCancel(bookingData, 0);
    } catch (error) {
      logger.error('Erreur lors de l\'annulation', { error, bookingId });
      showError('Erreur lors de l\'annulation. Veuillez réessayer.');
    } finally {
      setCancelling(false);
    }
  };

  const executeCancel = async (bookingData: DocumentData, fee: number) => {
    setCancelling(true);
    try {
      const { cancelBooking } = await import('@/services/taxi.service');
      await cancelBooking(bookingId, 'Annulé par le client', {
        cancelledBy: 'client',
        cancellationFee: fee,
      });

      if (fee > 0 && bookingData.userId) {
        try {
          const { debitCancellationPenalty } = await import('@/services/taxi.service');
          await debitCancellationPenalty(bookingId, bookingData.userId, fee);
        } catch (penaltyError) {
          logger.error('Erreur débit pénalité', { error: penaltyError });
        }
      }

      setShowCancelModal(false);
      setShowCancelConfirm(false);

      if (fee > 0) {
        showError(`Course annulée.\n\nDes frais d'annulation de ${fee.toLocaleString(DEFAULT_LOCALE, { minimumFractionDigits: 2 })} ${CURRENCY_CODE} ont été débités de votre portefeuille.`);
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
      <div className="bg-[#0F0F0F] rounded-lg shadow-md p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f29200] mx-auto mb-4"></div>
        <p className="text-[#9CA3AF]">Chargement du suivi...</p>
      </div>
    );
  }

  if (!booking) return null;

  const GoogleMap = mapsApi?.GoogleMap;
  const Marker = mapsApi?.Marker;
  const DirectionsRenderer = mapsApi?.DirectionsRenderer;

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
      <div className="bg-[#0F0F0F] rounded-xl shadow-lg overflow-hidden">
      {/* Carte */}
      <div className="relative h-[300px] sm:h-[400px] bg-[#1A1A1A]">
        {isLoaded && GoogleMap ? (
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
        {/* Mention réservation pour tiers */}
        {booking.bookedForSomeoneElse && booking.passengerName && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2">
            <span className="text-lg">👤</span>
            <p className="text-sm text-amber-300">
              Course réservée pour <span className="font-bold text-white">{booking.passengerName}</span>
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-[#242424] rounded-full flex items-center justify-center text-2xl">
              👨‍✈️
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">{booking.driverName}</h3>
              {booking.carModel && (
                <p className="text-sm text-[#9CA3AF]">
                  {[booking.carModel, booking.carColor].filter(Boolean).join(' • ')}
                </p>
              )}
              {booking.carPlate && (
                <div className="inline-block bg-[#3B82F6]/10 border border-[#3B82F6]/20 px-3 py-1 rounded text-sm font-mono font-bold mt-1 text-[#3B82F6]">
                  {booking.carPlate}
                </div>
              )}
            </div>
          </div>
          <div className="flex space-x-2">
            <button 
              onClick={() => setShowChat(true)}
              className="p-3 bg-[#3B82F6]/20 text-[#3B82F6] rounded-full hover:bg-[#3B82F6]/30 transition relative"
              title="Messagerie"
            >
              <MessageSquare className="w-5 h-5" />
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
        <div className="space-y-4 border-t border-white/[0.06] pt-4">
          <div className="flex items-start">
            <div className="flex flex-col items-center mr-3 mt-1">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <div className="w-0.5 h-8 bg-white/10 my-1"></div>
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            </div>
            <div className="flex-1 space-y-6">
              <div>
                <p className="text-xs text-gray-500 uppercase">Départ</p>
                <p className="font-medium text-white">{booking.pickup}</p>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 uppercase">Destination</p>
                  {booking.status === 'in_progress' && (
                    <button 
                      onClick={() => setShowEditDestModal(true)}
                      className="text-xs text-[#f29200] font-medium flex items-center hover:underline"
                    >
                      <Pencil className="w-4 h-4 mr-1" /> Modifier
                    </button>
                  )}
                </div>
                <p className="font-medium text-white">{booking.destination}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Suivi en temps réel (course en cours) */}
        {booking.status === 'in_progress' && realTimeDistance > 0 && (
          <div className="mt-4 p-4 bg-[#3B82F6]/5 border border-[#3B82F6]/10 rounded-lg">
            <h4 className="text-sm font-bold text-white mb-3 flex items-center">
              <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Suivi en temps réel
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#1A1A1A] border border-white/[0.06] rounded-lg p-3 shadow-sm">
                <p className="text-xs text-[#9CA3AF] mb-1">Distance restante</p>
                <p className="text-lg font-bold text-white">{realTimeDistance.toFixed(1)} km</p>
              </div>
              <div className="bg-[#1A1A1A] border border-white/[0.06] rounded-lg p-3 shadow-sm">
                <p className="text-xs text-[#9CA3AF] mb-1">Temps estimé</p>
                <p className="text-lg font-bold text-white">{realTimeDuration} min</p>
              </div>
            </div>
            <div className="mt-3 bg-[#1A1A1A] border border-white/[0.06] rounded-lg p-3 shadow-sm">
              <p className="text-xs text-[#9CA3AF] mb-1">Estimation tarifaire</p>
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
              <p className="text-xs text-[#9CA3AF] mt-1">
                Estimation basée sur le trajet en cours
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 pt-4 border-t border-white/[0.06]">
           {booking.status !== 'in_progress' && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="w-full py-3 text-[#EF4444] font-medium hover:bg-[#EF4444]/10 rounded-lg transition"
            >
              Annuler la course
            </button>
           )}
           {booking.status === 'in_progress' && (
             <p className="text-center text-sm text-[#9CA3AF] italic">
               Course en cours... Détendez-vous ! 🎵
             </p>
           )}
        </div>
      </div>

      {/* Modal de confirmation d'annulation */}
      {showCancelModal && !showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-white/[0.05] rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-2 text-center">Annuler ?</h3>
            <p className="text-[#9CA3AF] text-sm text-center mb-6">
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
                className="w-full bg-[#242424] hover:bg-white/10 text-white font-medium py-3 px-4 rounded-lg"
              >
                Non, retour
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmation pénalité d'annulation (course en cours) */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-red-500/30 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2 text-center">Annulation en cours</h3>
            <p className="text-[#9CA3AF] text-sm text-center mb-4">
              Vous annulez une course en cours. Des frais s&apos;appliquent.
            </p>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 text-center">
              <p className="text-xs text-red-400 uppercase font-semibold mb-1">Frais d&apos;annulation</p>
              <p className="text-2xl font-bold text-red-400">
                {cancellationFee.toLocaleString(DEFAULT_LOCALE, { minimumFractionDigits: 2 })} {CURRENCY_CODE}
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => {
                  const bookingRef = doc(db, 'bookings', bookingId);
                  getDoc(bookingRef).then(snap => {
                    if (snap.exists()) {
                      executeCancel(snap.data(), cancellationFee);
                    } else {
                      showError('Réservation introuvable. Veuillez réessayer.');
                      setShowCancelConfirm(false);
                    }
                  }).catch((err) => {
                    logger.error('Erreur lors de la vérification de la réservation', { error: err, bookingId });
                    showError('Erreur réseau. Veuillez réessayer.');
                    setShowCancelConfirm(false);
                  });
                }}
                disabled={cancelling}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg"
              >
                {cancelling ? 'Annulation...' : `Confirmer (${cancellationFee.toLocaleString(DEFAULT_LOCALE, { minimumFractionDigits: 2 })} ${CURRENCY_CODE})`}
              </button>
              <button
                onClick={() => { setShowCancelConfirm(false); setShowCancelModal(false); }}
                className="w-full bg-[#242424] hover:bg-white/10 text-white font-medium py-3 px-4 rounded-lg"
              >
                Non, garder la course
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de modification de destination */}
      {showEditDestModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-white/[0.05] rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Modifier la destination</h3>
            
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
              <p className="text-xs text-[#9CA3AF] mt-2">
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
                className="w-full bg-[#242424] hover:bg-white/10 text-white font-medium py-3 px-4 rounded-lg"
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
      </div>
    </>
  );
}
