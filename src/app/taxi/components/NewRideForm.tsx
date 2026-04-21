/**
 * Composant NewRideForm
 *
 * Formulaire pour créer une nouvelle course de taxi
 * Gère la sélection du départ, destination, type de véhicule et estimation
 */

'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod'; //  Ajout validation Zod (medJira.md #85)
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'; //  Ajout haptic (medJira.md #93)
import { Capacitor } from '@capacitor/core';
import { auth } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { useCapacitorGeolocation } from '@/hooks/useCapacitorGeolocation';
import { estimateFare, createBooking, getCarTypes, FareEstimate } from '@/services/taxi.service';
import { CarType, PlaceSuggestion, Location, PreciseLocation as BookingPreciseLocation } from '@/types';
import { AddressInput } from './AddressInput';
import { VehicleOption } from './VehicleOption';
import { FareSummary } from './FareSummary';
import { BonusSelector } from './BonusSelector';
const PaymentMethodSelector = dynamic(() => import('@/components/stripe/PaymentMethodSelector').then(m => ({ default: m.PaymentMethodSelector })), { ssr: false, loading: () => <div className="w-full h-24 bg-white/10 animate-pulse rounded-xl" /> })
const StripePaymentElement = dynamic(() => import('@/components/stripe/StripePaymentElement').then(m => ({ default: m.StripePaymentElement })), { ssr: false, loading: () => <div className="w-full h-48 bg-white/10 animate-pulse rounded-xl" /> })
import { logger } from '@/utils/logger';
import { CURRENCY_CODE } from '@/utils/constants';
import { formatCurrencyWithCode } from '@/utils/format';
import type { StripePaymentMethod } from '@/types/stripe';

//  Schéma Zod de validation pour la création de course (medJira.md #85)
const BookingSchema = z.object({
  userId: z.string().min(1, 'UID utilisateur requis'),
  userEmail: z.string().email('Email invalide').nullable().optional(),
  pickup: z.string().min(5, 'Adresse de départ trop courte (min 5 caractères)'),
  destination: z.string().min(5, 'Adresse de destination trop courte (min 5 caractères)'),
  pickupLocation: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
  pickupLocationAccuracy: z.number().optional(),
  destinationLocation: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
  distance: z.number().positive('Distance doit être positive'),
  duration: z.number().positive('Durée doit être positive'),
  price: z.number().positive('Prix doit être positif'),
  carType: z.string().min(1, 'Type de véhicule requis'),
  bonus: z.number().min(0).optional(),
});

interface NewRideFormProps {
  onBookingCreated?: (bookingId: string, pickup: string, destination: string, autoSearch?: boolean) => void;
  onSearchDriver?: () => void;
}

export const NewRideForm = ({ onBookingCreated, onSearchDriver }: NewRideFormProps) => {
  //  Fonction pour déclencher le haptic feedback (medJira.md #93)
  const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Light) => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style });
      } catch (error) {
        console.warn('Haptic feedback non disponible:', error);
      }
    }
  };
  const [currentUser, setCurrentUser] = useState<{ uid: string; email: string | null } | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupLocation, setPickupLocation] = useState<BookingPreciseLocation | null>(null);
  const [pickupAccuracy, setPickupAccuracy] = useState<number | null>(null);
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

  // États paiement
  const [modalStep, setModalStep] = useState<'summary' | 'payment' | 'stripe'>('summary');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<StripePaymentMethod>('card');
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletCurrency, setWalletCurrency] = useState('CAD');
  const [walletLoading, setWalletLoading] = useState(false);
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);

  const { isLoaded: mapsLoaded, autocompleteService } = useGoogleMaps();

  // Récupérer l'utilisateur actuel
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Utiliser le hook de géolocalisation avec précision ultra-haute
  const { 
    preciseLocation,
    error: geoError, 
    loading: geoLoading, 
    getCurrentPosition,
    getAccuracyQuality 
  } = useCapacitorGeolocation();
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
  // Ce code s'exécutera SEULEMENT si le hook réussit à obtenir une position avec précision
  if (preciseLocation) {
    setLoadingAddress(true);

    // Utiliser la position précise avec toutes les métadonnées
    const location: BookingPreciseLocation = {
      lat: preciseLocation.lat,
      lng: preciseLocation.lng,
      accuracy: preciseLocation.accuracy,
      altitude: preciseLocation.altitude,
      heading: preciseLocation.heading,
      speed: preciseLocation.speed,
      timestamp: preciseLocation.timestamp,
    };
    
    // Stocker la précision pour l'afficher et l'envoyer au backend
    setPickupAccuracy(preciseLocation.accuracy);
    
    // Mettre à jour les états du composant avec la position ultra-précise
    setCurrentLocation({ lat: location.lat, lng: location.lng });
    setPickupLocation(location);

    // Afficher temporairement les coordonnées avec la précision
    const accuracyText = preciseLocation.accuracy <= 20 ? '📍 Précis' : preciseLocation.accuracy <= 50 ? '📍 OK' : 'Imprécis';
    const coordsAddress = `${accuracyText} Ma position (±${Math.round(preciseLocation.accuracy)}m)`;
    setPickupAddress(coordsAddress);
    
    console.log(`📍 [GPS] Précision: ${preciseLocation.accuracy.toFixed(1)}m - Qualité: ${getAccuracyQuality()}`);

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
}, [preciseLocation, getAccuracyQuality]); // Dépend de la position précise du hook


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
    // Une adresse complète contient généralement une virgule (ex: "CN Tower, Toronto, Canada")
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

  const handlePickupSelect = async (suggestion: PlaceSuggestion) => {
    await triggerHaptic(ImpactStyle.Light); //  Haptic feedback (medJira.md #93)
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

  const handleDestinationSelect = async (suggestion: PlaceSuggestion) => {
    await triggerHaptic(ImpactStyle.Light); //  Haptic feedback (medJira.md #93)
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

    setModalStep('summary');
    setStripeClientSecret(null);
    setPendingBookingId(null);
    setShowConfirmModal(true);
  };

  // Étape 2 : passer à la sélection du paiement
  const handleProceedToPayment = async () => {
    setWalletLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch('/api/wallet/balance', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setWalletBalance(data.balance ?? 0);
        setWalletCurrency(data.currency ?? 'CAD');
        // Présélectionner wallet si le solde est suffisant
        if (data.balance >= (estimate?.price ?? 0)) {
          setSelectedPaymentMethod('wallet');
        } else {
          setSelectedPaymentMethod('card');
        }
      }
    } catch {
      setWalletBalance(0);
      setSelectedPaymentMethod('card');
    } finally {
      setWalletLoading(false);
    }
    setModalStep('payment');
  };

  // Étape 3a : paiement wallet → créer la réservation directement
  const handleWalletBooking = async () => {
    if (!currentUser || !pickupAddress || !destinationAddress || !selectedCarType || !estimate) return;
    await handleConfirmBooking('wallet');
  };

  // Étape 3b : paiement carte → créer réservation + PaymentIntent + afficher Stripe Elements
  const handleCardPaymentSetup = async () => {
    if (!currentUser || !pickupAddress || !destinationAddress || !selectedCarType || !estimate) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Créer la réservation avec paymentMethod: 'card'
      const bookingId = await createBookingInternal('card');
      if (!bookingId) return;

      // 2. Créer le PaymentIntent
      const token = await auth.currentUser!.getIdToken();
      const piRes = await fetch('/api/stripe/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bookingId,
          amount: (estimate.price ?? 0) + (bonus > 0 ? bonus : 0),
          currency: 'cad',
          userId: currentUser.uid,
        }),
      });

      if (!piRes.ok) {
        const errData = await piRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Impossible de créer le paiement Stripe');
      }

      const { clientSecret } = await piRes.json();
      setStripeClientSecret(clientSecret);
      setPendingBookingId(bookingId);
      setModalStep('stripe');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de la configuration du paiement';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Appelé par StripePaymentElement après autorisation de la carte
  const handleCardAuthorized = async (paymentIntentId: string) => {
    logger.info('Carte autorisée', { paymentIntentId, bookingId: pendingBookingId });
    setShowConfirmModal(false);
    setModalStep('summary');

    if (pendingBookingId && onBookingCreated) {
      onBookingCreated(pendingBookingId, pickupAddress, destinationAddress, autoSearchEnabled);
    }
    if (onSearchDriver) onSearchDriver();
  };

  // Crée la réservation Firestore avec la méthode de paiement choisie
  const createBookingInternal = async (paymentMethod: StripePaymentMethod): Promise<string | null> => {
    try {
      const bookingData = {
        userId: currentUser!.uid,
        userEmail: currentUser!.email,
        pickup: pickupAddress,
        destination: destinationAddress,
        pickupLocation: pickupLocation || undefined,
        pickupLocationAccuracy: pickupAccuracy || undefined,
        destinationLocation: destinationLocation || undefined,
        distance: estimate!.distance,
        duration: estimate!.duration,
        price: estimate!.price,
        carType: selectedCarType!.name,
        status: 'pending' as const,
        paymentMethod,
        ...(bonus > 0 && { bonus }),
        ...(autoSearchEnabled && {
          automaticSearch: { enabled: true, intervalSeconds: 60, attemptCount: 0, maxAttempts: 10 },
        }),
      };
      BookingSchema.parse(bookingData);
      return await createBooking(bookingData);
    } catch (err) {
      logger.error('Erreur création réservation', { error: err });
      setError(err instanceof Error ? err.message : 'Erreur lors de la création de la course');
      setLoading(false);
      return null;
    }
  };

  // Confirmation finale pour paiement wallet (ou fallback sans méthode)
  const handleConfirmBooking = async (paymentMethod: StripePaymentMethod = 'wallet') => {
    if (!currentUser || !pickupAddress || !destinationAddress || !selectedCarType || !estimate) {
      logger.warn('Données manquantes pour la confirmation de course');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const bookingId = await createBookingInternal(paymentMethod);
      if (!bookingId) return;

      logger.info('Course créée', { bookingId, paymentMethod, accuracy: pickupAccuracy ? `${pickupAccuracy.toFixed(0)}m` : 'N/A' });

      if (Capacitor.isNativePlatform()) {
        try {
          await Haptics.notification({ type: NotificationType.Success });
        } catch (error) {
          console.warn('Haptic notification non disponible:', error);
        }
      }

      setShowConfirmModal(false);
      setModalStep('summary');

      if (onBookingCreated) {
        onBookingCreated(bookingId, pickupAddress, destinationAddress, autoSearchEnabled);
      }
      if (onSearchDriver) {
        onSearchDriver();
      }
    } catch (err: unknown) {
      logger.error('Erreur création course', { error: err });
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de la création de la course';
      setError(errorMessage);

      if (Capacitor.isNativePlatform()) {
        try {
          await Haptics.notification({ type: NotificationType.Error });
        } catch (error) {
          console.warn('Haptic notification non disponible:', error);
        }
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="w-full max-w-2xl mx-auto px-2 sm:px-0">
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Message d'erreur GPS - affiché si la géolocalisation échoue */}
        {geoError && !pickupAddress && (
          <div className="bg-[#f29200]/10 border-l-4 border-orange-400 p-4 rounded-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-orange-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-[#f29200]">
                  Impossible de détecter votre position
                </h3>
                <div className="mt-2 text-sm text-[#f29200]">
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
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-[#f29200] bg-[#f29200]/20 hover:bg-[#f29200]/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors"
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
          <label className="block text-sm font-medium text-[#9CA3AF] mb-3">
            Type de véhicule
            <span className="text-red-500 ml-1">*</span>
          </label>
          {carTypes.length === 0 ? (
            <div className="p-4 border-2 border-dashed border-white/[0.08] rounded-lg text-center">
              <p className="text-[#9CA3AF] text-sm">
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
                  onSelect={async (carType) => {
                    await triggerHaptic(ImpactStyle.Light); //  Haptic feedback (medJira.md #93)
                    setSelectedCarType(carType);
                  }}
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
        <div className="space-y-4 pt-2 border-t border-white/[0.05]">
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
              <div className="mt-3 p-4 bg-[#1A1A1A] rounded-xl border border-white/[0.05]">
                <BonusSelector
                  selectedBonus={bonus}
                  onSelect={setBonus}
                />
              </div>
            )}
          </div>

          {/* Toggle Recherche Auto */}
          <div className="flex items-center gap-3 p-3 bg-[#3B82F6]/10 rounded-xl border border-[#3B82F6]/20">
            <div className="flex items-center h-5">
              <input
                id="auto-search"
                type="checkbox"
                checked={autoSearchEnabled}
                onChange={(e) => setAutoSearchEnabled(e.target.checked)}
                className="w-5 h-5 text-[#f29200] border-white/[0.08] rounded focus:ring-[#f29200]"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="auto-search" className="text-sm font-medium text-white cursor-pointer">
                Recherche automatique
              </label>
              <p className="text-xs text-[#9CA3AF]">
                Réessayer automatiquement si aucun chauffeur n&apos;est trouvé immédiatement.
              </p>
            </div>
          </div>
        </div>

        {/* Message d'erreur */}
        {error && (
          <div className="p-3 bg-[#EF4444]/10 border-l-4 border-red-500 text-[#EF4444] rounded">
            <p>{error}</p>
          </div>
        )}

        {/* Bouton de soumission */}
        <button
          type="submit"
          disabled={!pickupAddress || !destinationAddress || !selectedCarType || !estimate || loading || estimating}
          className="w-full bg-[#f29200] hover:bg-[#e68600] active:bg-[#d67a00] text-white font-bold py-4 px-6 rounded-[28px] transition disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation text-base sm:text-lg shadow-[0_0_20px_rgba(242,146,0,0.4)]"
          style={{ minHeight: '48px' }} // Zone tactile minimale pour mobile
        >
          {loading ? 'Création en cours...' : 'Demander une course'}
        </button>
      </form>

      {/* Modal de confirmation */}
      {showConfirmModal && estimate && selectedCarType && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-lg flex items-center justify-center p-2 sm:p-4 z-50 transition-opacity duration-300">
          <div className="bg-[#1A1A1A] rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl transform transition-all duration-300 scale-100">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#f29200] to-[#e68600] p-4 sm:p-6 text-white">
              <h2 className="text-xl sm:text-2xl font-bold mb-1">Confirmer la course</h2>
              <p className="text-xs sm:text-sm text-white/90">Vérifiez les détails avant de confirmer</p>
            </div>

            <div className="p-4 sm:p-6">
              <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
                {/* Point de départ */}
                <div className="border-b border-white/[0.06] pb-3 sm:pb-4">
                  <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-1">De</p>
                  <p className="text-sm sm:text-base font-semibold text-white leading-tight break-words">{pickupAddress}</p>
                </div>

                {/* Destination */}
                <div className="border-b border-white/[0.06] pb-3 sm:pb-4">
                  <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-1">À</p>
                  <p className="text-sm sm:text-base font-semibold text-white leading-tight break-words">{destinationAddress}</p>
                </div>

                {/* Informations de la course */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-white/[0.06]">
                  <div>
                    <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-1">Véhicule</p>
                    <p className="text-sm sm:text-base font-semibold text-white">{selectedCarType.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-1">Distance</p>
                    <p className="text-sm sm:text-base font-semibold text-white">{estimate.distance.toFixed(1)} km</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-1">Durée</p>
                    <p className="text-sm sm:text-base font-semibold text-white">~{estimate.duration} min</p>
                  </div>
                </div>

                {/* Prix estimé - Mise en évidence */}
                <div className="bg-gradient-to-r from-[#f29200] to-[#e68600] p-4 sm:p-5 rounded-lg shadow-lg">
                  <p className="text-xs sm:text-sm font-semibold text-white/90 mb-2">Prix estimé</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">
                    {estimate.price ? formatCurrencyWithCode(estimate.price) : `0 ${CURRENCY_CODE}`}
                  </p>
                  {bonus > 0 && (
                    <div className="mt-1 pt-1 border-t border-white/20 flex justify-between items-center text-white/90 text-sm">
                      <span>+ Bonus chauffeur</span>
                      <span className="font-bold">+{formatCurrencyWithCode(bonus)}</span>
                    </div>
                  )}
                  <p className="text-xs text-white/80 mt-2">* Le prix final peut varier selon le trafic</p>
                </div>
              </div>

              {/* Boutons d'action — Étape résumé */}
              {modalStep === 'summary' && (
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <button
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 px-4 py-3 border-2 border-white/[0.08] rounded-lg active:bg-white/5 hover:bg-white/5 hover:border-white/10 font-semibold text-white transition touch-manipulation"
                    disabled={loading}
                    style={{ minHeight: '48px' }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleProceedToPayment}
                    disabled={loading || walletLoading}
                    className="flex-1 bg-[#f29200] active:bg-[#d67a00] hover:bg-[#e68600] text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg touch-manipulation"
                    style={{ minHeight: '48px' }}
                  >
                    {walletLoading ? 'Chargement...' : 'Continuer →'}
                  </button>
                </div>
              )}

              {/* Étape sélection paiement */}
              {modalStep === 'payment' && (
                <div className="space-y-4">
                  <PaymentMethodSelector
                    walletBalance={walletBalance}
                    fareAmount={(estimate?.price ?? 0) + (bonus > 0 ? bonus : 0)}
                    currency={walletCurrency}
                    selectedMethod={selectedPaymentMethod}
                    onSelect={setSelectedPaymentMethod}
                    loading={loading}
                  />
                  {error && (
                    <div className="p-3 bg-[#EF4444]/10 border-l-4 border-red-500 text-[#EF4444] rounded text-sm">
                      {error}
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <button
                      onClick={() => setModalStep('summary')}
                      className="flex-1 px-4 py-3 border-2 border-white/[0.08] rounded-lg font-semibold text-white transition touch-manipulation"
                      disabled={loading}
                      style={{ minHeight: '48px' }}
                    >
                      ← Retour
                    </button>
                    <button
                      onClick={selectedPaymentMethod === 'wallet' ? handleWalletBooking : handleCardPaymentSetup}
                      disabled={loading}
                      className="flex-1 bg-[#f29200] active:bg-[#d67a00] hover:bg-[#e68600] text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg touch-manipulation"
                      style={{ minHeight: '48px' }}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          En cours...
                        </span>
                      ) : selectedPaymentMethod === 'wallet' ? 'Confirmer (Wallet)' : 'Payer par carte →'}
                    </button>
                  </div>
                </div>
              )}

              {/* Étape Stripe Elements */}
              {modalStep === 'stripe' && stripeClientSecret && (
                <div className="space-y-4">
                  <StripePaymentElement
                    clientSecret={stripeClientSecret}
                    amount={(estimate?.price ?? 0) + (bonus > 0 ? bonus : 0)}
                    currency={walletCurrency}
                    onSuccess={handleCardAuthorized}
                    onError={(msg) => setError(msg)}
                    submitLabel="Autoriser le paiement"
                  />
                  <button
                    onClick={() => setModalStep('payment')}
                    className="w-full px-4 py-2 text-sm text-[#9CA3AF] underline"
                  >
                    ← Changer de méthode de paiement
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

