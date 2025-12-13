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
import { useCapacitorGeolocation } from '@/hooks/useCapacitorGeolocation';
import { estimateFare, createBooking, getCarTypes, FareEstimate } from '@/services/taxi.service';
import { CarType, PlaceSuggestion, Location } from '@/types';
import { AddressInput } from './AddressInput';
import { VehicleOption } from './VehicleOption';
import { FareSummary } from './FareSummary';
import { BonusSelector } from './BonusSelector';
import { logger } from '@/utils/logger';

interface NewRideFormProps {
  onBookingCreated?: (bookingId: string, pickup: string, destination: string, autoSearch?: boolean) => void;
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

  // Nouveaux états pour Bonus et Recherche Auto
  const [bonus, setBonus] = useState(0);
  const [showBonus, setShowBonus] = useState(false);
  const [autoSearchEnabled, setAutoSearchEnabled] = useState(false);

  const { isLoaded: mapsLoaded, autocompleteService } = useGoogleMaps();

  // Récupérer l'utilisateur actuel
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  //const { getCurrentPosition, loading: geoLoading, error: geoError } = useCapacitorGeolocation(); //ceci est OK
  // NOUVEAU CODE : Récupérez tout ce dont vous avez besoin du hook
  const { location: currentGpsLocation, error: geoError, loading: geoLoading, getCurrentPosition } = useCapacitorGeolocation();
  const [loadingAddress, setLoadingAddress] = useState(false);

  // Récupérer la position GPS //ceci est OK
  /*useEffect(() => {
    // Attendre que Google Maps soit chargé
    if (!mapsLoaded) return;

    const fetchLocation = async () => {
      try {
        setLoadingAddress(true);
        logger.info('Requesting GPS position', { timestamp: new Date().toISOString() });

        const position = await getCurrentPosition();

        if (position) {
          const location: Location = {
            lat: position.lat,
            lng: position.lng,
          };
          setCurrentLocation(location);
          setPickupLocation(location);

          // Afficher immédiatement les coordonnées pendant qu'on cherche l'adresse
          const coordsAddress = `Ma position (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`;
          setPickupAddress(coordsAddress);

          // Reverse Geocoding optimisé (client-side uniquement pour vitesse)
          if (window.google && window.google.maps) {
            try {
              const geocoder = new window.google.maps.Geocoder();

              // Ajouter un timeout de 3 secondes pour le geocoding
              const geocodePromise = geocoder.geocode({ location });
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Geocoding timeout')), 3000)
              );

              const response = await Promise.race([geocodePromise, timeoutPromise]) as google.maps.GeocoderResponse;

              if (response.results && response.results[0]) {
                const address = response.results[0].formatted_address;
                setPickupAddress(address);
                logger.info('Address obtained via Client Geocoder', { address });
              }
            } catch (e) {
              console.warn('Client Geocoder failed or timeout', e);
              // Garder les coordonnées affichées
            }
          }

          setLoadingAddress(false);
        }
      } catch (err: unknown) {
        logger.error('Geolocation error', { error: err });
        setPickupLocation(null);
        setPickupAddress('');
        setLoadingAddress(false);
      }
    };

    fetchLocation();
  }, [mapsLoaded, getCurrentPosition]); */

  // ÉTAPE 1 : Déclencher la géolocalisation une seule fois
useEffect(() => {
  // On s'assure que Google Maps est prêt avant de demander la position
  if (!mapsLoaded) return;

  // On appelle la fonction, c'est tout. Le hook s'occupe du reste.
  getCurrentPosition();

}, [mapsLoaded, getCurrentPosition]); // Le tableau de dépendances est correct


// ÉTAPE 2 : Réagir aux changements venant du hook
useEffect(() => {
  // Ce code s'exécutera SEULEMENT si le hook réussit à obtenir une position
  if (currentGpsLocation) { // <-- ICI, on lit enfin la valeur de `currentGpsLocation`
    setLoadingAddress(true);

    const location: Location = {
      lat: currentGpsLocation.lat,
      lng: currentGpsLocation.lng,
    };
    
    // Mettre à jour les états du composant avec la nouvelle position
    setCurrentLocation(location);
    setPickupLocation(location);

    // Afficher temporairement les coordonnées
    const coordsAddress = `Ma position (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`;
    setPickupAddress(coordsAddress);

    // Votre logique de Geocoding inversé (traduire les coordonnées en adresse)
    if (window.google && window.google.maps) {
      const geocoder = new window.google.maps.Geocoder();
      
      // Utilisation de .then/.catch/.finally pour une meilleure lisibilité
      geocoder.geocode({ location })
        .then(response => {
          if (response.results && response.results[0]) {
            setPickupAddress(response.results[0].formatted_address);
          }
        })
        .catch(e => {
          console.warn('Le Geocoding inversé a échoué, les coordonnées sont conservées.', e);
        })
        .finally(() => {
          setLoadingAddress(false); // Arrêter le chargement dans tous les cas
        });
    } else {
      // Si google.maps n'est pas disponible, arrêter le chargement
      setLoadingAddress(false);
    }
  }
}, [currentGpsLocation]); // <-- Ce useEffect dépend UNIQUEMENT de la position GPS du hook


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
    console.log('🔍 [NewRideForm] handleConfirmBooking appelé');
    console.log('🔍 [NewRideForm] État actuel:', {
      currentUser: !!currentUser,
      pickupAddress: !!pickupAddress,
      destinationAddress: !!destinationAddress,
      selectedCarType: !!selectedCarType,
      estimate: !!estimate
    });

    if (!currentUser || !pickupAddress || !destinationAddress || !selectedCarType || !estimate) {
      console.error('❌ [NewRideForm] Données manquantes pour la confirmation');
      if (!currentUser) console.error('❌ User manquant');
      if (!pickupAddress) console.error('❌ Pickup manquant');
      if (!destinationAddress) console.error('❌ Destination manquante');
      if (!selectedCarType) console.error('❌ Type véhicule manquant');
      if (!estimate) console.error('❌ Estimation manquante');
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
        // Nouveaux champs (ajout conditionnel pour éviter undefined)
        ...(bonus > 0 && { bonus }),
        ...(autoSearchEnabled && {
          automaticSearch: {
            enabled: true,
            intervalSeconds: 60,
            attemptCount: 0,
            maxAttempts: 10,
          }
        }),
      });

      logger.info('Course créée', { bookingId });
      setShowConfirmModal(false);

      if (onBookingCreated) {
        onBookingCreated(bookingId, pickupAddress, destinationAddress, autoSearchEnabled);
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

  // DEBUG : Afficher les valeurs pour comprendre pourquoi le message ne s'affiche pas
  console.log('🔍 [NewRideForm] geoError:', geoError);
  console.log('🔍 [NewRideForm] pickupAddress:', pickupAddress);
  console.log('🔍 [NewRideForm] Condition (geoError || !pickupAddress):', (geoError || !pickupAddress));

  return (
    <div className="w-full max-w-2xl mx-auto px-2 sm:px-0">
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Message d'erreur GPS - affiché si la géolocalisation échoue */}
        {geoError && !pickupAddress && (
          <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-orange-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-orange-800">
                  Impossible de détecter votre position
                </h3>
                <div className="mt-2 text-sm text-orange-700">
                  <p>Le signal GPS est trop faible. Pour une meilleure précision :</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Sortez à l&apos;extérieur (ciel dégagé)</li>
                    <li>Éloignez-vous des immeubles</li>
                    <li>Vérifiez que le GPS est activé sur votre téléphone</li>
                  </ul>
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-orange-700 bg-orange-100 hover:bg-orange-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors"
                  >
                    <svg className="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Réessayer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
          externalLoading={geoLoading || loadingAddress}
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

        {/* Options Avancées (Bonus & Recherche Auto) */}
        <div className="space-y-4 pt-2 border-t border-gray-100">
          {/* Toggle Bonus */}
          <div>
            <button
              type="button"
              onClick={() => setShowBonus(!showBonus)}
              className="text-sm font-medium text-[#f29200] hover:text-[#d67a00] flex items-center gap-1 transition-colors"
            >
              {showBonus ? '− Masquer les options de motivation' : '+ Ajouter un bonus pour le chauffeur'}
            </button>

            {showBonus && (
              <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <BonusSelector
                  selectedBonus={bonus}
                  onSelect={setBonus}
                />
              </div>
            )}
          </div>

          {/* Toggle Recherche Auto */}
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
            <div className="flex items-center h-5">
              <input
                id="auto-search"
                type="checkbox"
                checked={autoSearchEnabled}
                onChange={(e) => setAutoSearchEnabled(e.target.checked)}
                className="w-5 h-5 text-[#f29200] border-gray-300 rounded focus:ring-[#f29200]"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="auto-search" className="text-sm font-medium text-gray-900 cursor-pointer">
                Recherche automatique
              </label>
              <p className="text-xs text-gray-500">
                Réessayer automatiquement si aucun chauffeur n&apos;est trouvé immédiatement.
              </p>
            </div>
          </div>
        </div>

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
                  {bonus > 0 && (
                    <div className="mt-1 pt-1 border-t border-white/20 flex justify-between items-center text-white/90 text-sm">
                      <span>+ Bonus chauffeur</span>
                      <span className="font-bold">+{bonus} FCFA</span>
                    </div>
                  )}
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

