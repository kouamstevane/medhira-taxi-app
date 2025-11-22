/**
 * Composant NewRideForm
 * 
 * Formulaire pour créer une nouvelle course de taxi
 * Gère la sélection du départ, destination, type de véhicule et estimation
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { auth } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { estimateFare, createBooking, getCarTypes, FareEstimate } from '@/services/taxi.service';
import { CarType, PlaceSuggestion, Location } from '@/types';
import { AddressInput } from './AddressInput';
import { VehicleOption } from './VehicleOption';
import { FareSummary } from './FareSummary';
import { logger } from '@/utils/logger';

interface NewRideFormProps {
  onBookingCreated?: (bookingId: string, pickup: string, destination: string) => void;
  onSearchDriver?: () => void;
}

export const NewRideForm = ({ onBookingCreated, onSearchDriver }: NewRideFormProps) => {
  const [currentUser, setCurrentUser] = useState<{ uid: string; email: string | null } | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupLocation, setPickupLocation] = useState<Location | null>(null);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationLocation, setDestinationLocation] = useState<Location | null>(null);
  const [selectedCarType, setSelectedCarType] = useState<CarType | null>(null);
  const [carTypes, setCarTypes] = useState<CarType[]>([]);
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const { isLoaded: mapsLoaded, autocompleteService } = useGoogleMaps();

  // Récupérer l'utilisateur actuel
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Récupérer la position GPS
  useEffect(() => {
    // Attendre que Google Maps soit chargé
    if (!mapsLoaded) return;

    if (navigator.geolocation) {
      // Options pour améliorer la précision sur mobile
      const options: PositionOptions = {
        enableHighAccuracy: true, // Utiliser GPS si disponible
        timeout: 20000, // Timeout de 20 secondes
        maximumAge: 0, // Ne jamais utiliser de position en cache - toujours demander une nouvelle position
      };
      
      logger.info('Requesting GPS permission', { timestamp: new Date().toISOString() });
      
      // Tenter d'obtenir la position
      const attemptGeolocation = () => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location: Location = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            setCurrentLocation(location);
            setPickupLocation(location);
            
            // Obtenir l'adresse depuis les coordonnées
            if (window.google && window.google.maps) {
              const geocoder = new window.google.maps.Geocoder();
              geocoder.geocode({ location }, (results, status) => {
                if (status === 'OK' && results?.[0]) {
                  setPickupAddress(results[0].formatted_address);
                  logger.info('GPS position obtained', { address: results[0].formatted_address });
                } else {
                  const coordsAddress = `Position actuelle (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`;
                  setPickupAddress(coordsAddress);
                  logger.info('GPS coordinates only', { address: coordsAddress });
                }
              });
            }
          },
          (err) => {
            // Déterminer le type d'erreur pour un message clair
            let errorMessage = '';
            switch (err.code) {
              case err.PERMISSION_DENIED:
                errorMessage = 'Accès à la localisation refusé. Veuillez saisir votre adresse de départ.';
                break;
              case err.POSITION_UNAVAILABLE:
                errorMessage = 'Position GPS indisponible. Veuillez saisir votre adresse de départ.';
                break;
              case err.TIMEOUT:
                errorMessage = 'Délai de localisation dépassé. Veuillez saisir votre adresse de départ.';
                break;
              default:
                errorMessage = 'Impossible d\'obtenir votre position. Veuillez saisir votre adresse de départ.';
            }
            
            logger.info('Geolocation error', { errorMessage, errorCode: err.code, error: err.message });
            
            // NE PAS remplir automatiquement - laisser l'utilisateur saisir
            const defaultLocation: Location = { lat: 3.848, lng: 11.5021 }; // Position par défaut pour la carte uniquement
            setCurrentLocation(defaultLocation);
            setPickupLocation(null); // Pas de position de pickup
            setPickupAddress(''); // Champ VIDE - l'utilisateur doit saisir
            setError(errorMessage); // Afficher le message d'erreur
          },
          options
        );
      };
      
      // Sur HTTP (mobile dev), essayer watchPosition qui peut mieux fonctionner
      if (window.location.protocol === 'http:') {
        logger.info('HTTP detected - using watchPosition for better mobile support');
        const watchId = navigator.geolocation.watchPosition(
          (position) => {
            const location: Location = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            setCurrentLocation(location);
            setPickupLocation(location);
            
            // Obtenir l'adresse
            if (window.google && window.google.maps) {
              const geocoder = new window.google.maps.Geocoder();
              geocoder.geocode({ location }, (results, status) => {
                if (status === 'OK' && results?.[0]) {
                  setPickupAddress(results[0].formatted_address);
                  logger.info('GPS position obtained via watchPosition', { address: results[0].formatted_address });
                }
              });
            }
            
            // Arrêter le watch après avoir obtenu la position
            navigator.geolocation.clearWatch(watchId);
          },
          (err) => {
            logger.info('watchPosition failed, trying getCurrentPosition', { error: err.message });
            attemptGeolocation(); // Fallback sur getCurrentPosition
          },
          options
        );
      } else {
        attemptGeolocation();
      }
    } else {
      // Géolocalisation non supportée
      const defaultLocation: Location = { lat: 3.848, lng: 11.5021 };
      setCurrentLocation(defaultLocation);
      setPickupLocation(null);
      setPickupAddress(''); // Champ VIDE
      setError('Votre navigateur ne supporte pas la géolocalisation. Veuillez saisir votre adresse de départ.');
      logger.info('Geolocation not supported', { message: 'Géolocalisation non supportée par le navigateur' });
    }
  }, [mapsLoaded]);

  // Charger les types de véhicules
  useEffect(() => {
    const loadCarTypes = async () => {
      try {
        const types = await getCarTypes();
        setCarTypes(types);
        if (types.length > 0) {
          setSelectedCarType(types[0]); // Sélectionner le premier par défaut
        }
      } catch (err: unknown) {
        logger.error('Erreur chargement types véhicules', { error: err });
        setError('Impossible de charger les types de véhicules');
      }
    };
    loadCarTypes();
  }, []);

  // Vérifier si une adresse est complète (contient une virgule, signe d'une adresse complète)
  const isCompleteAddress = useCallback((address: string): boolean => {
    if (!address || address.length < 5) return false;
    // Une adresse complète contient généralement une virgule (ex: "Lycée de Makepe, Douala, Cameroun")
    // Ou au moins 3 mots séparés par des espaces
    return address.includes(',') || address.split(' ').length >= 3;
  }, []);

  const calculateEstimate = useCallback(async () => {
    if (!pickupAddress || !destinationAddress || !selectedCarType) return;
    
    // Ne calculer que si les adresses sont complètes
    if (!isCompleteAddress(pickupAddress) || !isCompleteAddress(destinationAddress)) {
      setEstimate(null);
      return;
    }

    setEstimating(true);
    setError(null);

    try {
      const result = await estimateFare({
        from: pickupAddress,
        to: destinationAddress,
        type: selectedCarType.id,
      });

      setEstimate(result);
      logger.info('Estimation calculée', { estimate: result });
    } catch (err: unknown) {
      logger.error('Erreur calcul estimation', { error: err });
      setError((err as Error).message || 'Erreur lors du calcul de l\'estimation');
      setEstimate(null);
    } finally {
      setEstimating(false);
    }
  }, [pickupAddress, destinationAddress, selectedCarType, isCompleteAddress]);

  // Calculer l'estimation quand les champs changent (avec validation)
  useEffect(() => {
    if (!pickupAddress || !destinationAddress || !selectedCarType || !mapsLoaded) {
      setEstimate(null);
      return;
    }

    // Vérifier si les adresses sont complètes avant de calculer
    if (!isCompleteAddress(pickupAddress) || !isCompleteAddress(destinationAddress)) {
      setEstimate(null);
      return;
    }

    // Debounce pour éviter trop de requêtes pendant la saisie
    const timer = setTimeout(() => {
      calculateEstimate();
    }, 500);

    return () => clearTimeout(timer);
  }, [pickupAddress, destinationAddress, selectedCarType, mapsLoaded, calculateEstimate, isCompleteAddress]);

  const handlePickupSelect = (suggestion: PlaceSuggestion) => {
    setPickupAddress(suggestion.description);
    setError(null); // Réinitialiser l'erreur
    // Obtenir les coordonnées depuis place_id pour une meilleure précision
    if (window.google && window.google.maps) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ placeId: suggestion.place_id }, (results, status) => {
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          setPickupLocation({
            lat: results[0].geometry.location.lat(),
            lng: results[0].geometry.location.lng(),
          });
        }
      });
    }
  };

  const handleDestinationSelect = (suggestion: PlaceSuggestion) => {
    setDestinationAddress(suggestion.description);
    setError(null); // Réinitialiser l'erreur
    // Obtenir les coordonnées depuis place_id pour une meilleure précision
    if (window.google && window.google.maps) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ placeId: suggestion.place_id }, (results, status) => {
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          setDestinationLocation({
            lat: results[0].geometry.location.lat(),
            lng: results[0].geometry.location.lng(),
          });
        }
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pickupAddress || !destinationAddress || !selectedCarType || !estimate) {
      setError('Veuillez remplir tous les champs et attendre l\'estimation');
      return;
    }

    if (!currentUser) {
      setError('Veuillez vous connecter pour demander une course');
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmBooking = async () => {
    if (!currentUser || !pickupAddress || !destinationAddress || !selectedCarType || !estimate) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const bookingId = await createBooking({
        userId: currentUser.uid,
        userEmail: currentUser.email,
        pickup: pickupAddress,
        destination: destinationAddress,
        pickupLocation: pickupLocation || undefined,
        destinationLocation: destinationLocation || undefined,
        distance: estimate.distance,
        duration: estimate.duration,
        price: estimate.price,
        carType: selectedCarType.name,
        status: 'pending',
      });

      logger.info('Course créée', { bookingId });
      setShowConfirmModal(false);
      
      if (onBookingCreated) {
        onBookingCreated(bookingId, pickupAddress, destinationAddress);
      }
      
      if (onSearchDriver) {
        onSearchDriver();
      }
    } catch (err: unknown) {
      logger.error('Erreur création course', { error: err });
      setError((err as Error).message || 'Erreur lors de la création de la course');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-2 sm:px-0">
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Point de départ */}
        <AddressInput
          label="Point de départ"
          value={pickupAddress}
          onChange={setPickupAddress}
          onSelect={handlePickupSelect}
          placeholder="Où êtes-vous ?"
          autocompleteService={autocompleteService}
          location={currentLocation}
          required
          error={error && !pickupAddress ? error : undefined}
        />

        {/* Destination */}
        <AddressInput
          label="Destination"
          value={destinationAddress}
          onChange={setDestinationAddress}
          onSelect={handleDestinationSelect}
          placeholder="Où allez-vous ?"
          autocompleteService={autocompleteService}
          location={currentLocation}
          required
        />

        {/* Types de véhicules */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Type de véhicule
            <span className="text-red-500 ml-1">*</span>
          </label>
          {carTypes.length === 0 ? (
            <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center">
              <p className="text-gray-500 text-sm">
                {error && error.includes('types de véhicules') 
                  ? 'Impossible de charger les types de véhicules. Veuillez rafraîchir la page.'
                  : 'Chargement des types de véhicules...'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {carTypes.map((carType) => (
                <VehicleOption
                  key={carType.id}
                  carType={carType}
                  selected={selectedCarType?.id === carType.id}
                  onSelect={setSelectedCarType}
                  disabled={false}
                />
              ))}
            </div>
          )}
        </div>

        {/* Estimation */}
        <FareSummary
          distance={estimate?.distance ?? null}
          duration={estimate?.duration ?? null}
          price={estimate?.price ?? null}
          loading={estimating}
        />

        {/* Message d'erreur */}
        {error && (
          <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded">
            <p>{error}</p>
          </div>
        )}

        {/* Bouton de soumission */}
        <button
          type="submit"
          disabled={!pickupAddress || !destinationAddress || !selectedCarType || !estimate || loading || estimating}
          className="w-full bg-[#f29200] hover:bg-[#e68600] active:bg-[#d67a00] text-white font-bold py-4 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation text-base sm:text-lg"
          style={{ minHeight: '48px' }} // Zone tactile minimale pour mobile
        >
          {loading ? 'Création en cours...' : 'Demander une course'}
        </button>
      </form>

      {/* Modal de confirmation */}
      {showConfirmModal && estimate && selectedCarType && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-lg flex items-center justify-center p-2 sm:p-4 z-50 transition-opacity duration-300">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl transform transition-all duration-300 scale-100">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#f29200] to-[#e68600] p-4 sm:p-6 text-white">
              <h2 className="text-xl sm:text-2xl font-bold mb-1">Confirmer la course</h2>
              <p className="text-xs sm:text-sm text-white/90">Vérifiez les détails avant de confirmer</p>
            </div>
            
            <div className="p-4 sm:p-6">
              <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
                {/* Point de départ */}
                <div className="border-b border-gray-200 pb-3 sm:pb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">De</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900 leading-tight break-words">{pickupAddress}</p>
                </div>
                
                {/* Destination */}
                <div className="border-b border-gray-200 pb-3 sm:pb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">À</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-900 leading-tight break-words">{destinationAddress}</p>
                </div>
                
                {/* Informations de la course */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-gray-200">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Véhicule</p>
                    <p className="text-sm sm:text-base font-semibold text-gray-900">{selectedCarType.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Distance</p>
                    <p className="text-sm sm:text-base font-semibold text-gray-900">{estimate.distance.toFixed(1)} km</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Durée</p>
                    <p className="text-sm sm:text-base font-semibold text-gray-900">~{estimate.duration} min</p>
                  </div>
                </div>
                
                {/* Prix estimé - Mise en évidence */}
                <div className="bg-gradient-to-r from-[#f29200] to-[#e68600] p-4 sm:p-5 rounded-lg shadow-lg">
                  <p className="text-xs sm:text-sm font-semibold text-white/90 mb-2">Prix estimé</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">
                    {estimate.price ? estimate.price.toLocaleString('fr-FR') : '0'} {estimate.currency || 'FCFA'}
                  </p>
                  <p className="text-xs text-white/80 mt-2">* Le prix final peut varier selon le trafic</p>
                </div>
              </div>

              {/* Boutons d'action */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg active:bg-gray-50 hover:bg-gray-50 hover:border-gray-400 font-semibold text-gray-700 transition touch-manipulation"
                  disabled={loading}
                  style={{ minHeight: '48px' }}
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmBooking}
                  disabled={loading}
                  className="flex-1 bg-[#f29200] active:bg-[#d67a00] hover:bg-[#e68600] text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl touch-manipulation"
                  style={{ minHeight: '48px' }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Création...
                    </span>
                  ) : (
                    'Confirmer'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

