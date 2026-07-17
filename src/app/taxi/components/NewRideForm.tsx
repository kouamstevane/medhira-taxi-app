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
import { auth, functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { useCapacitorGeolocation } from '@/hooks/useCapacitorGeolocation';
import { useCountryDetection } from '@/hooks/useCountryDetection';
import { estimateFare, createBooking, getCarTypes, FareEstimate } from '@/services/taxi.service';
import { reverseGeocodeAddress } from '@/services/reverseGeocode.service';
import { CarType, PlaceSuggestion, Location, PreciseLocation as BookingPreciseLocation } from '@/types';
import { AddressInput } from './AddressInput';
import { VehicleOption } from './VehicleOption';
import { VehicleDetailsSheet } from './VehicleDetailsSheet';
import { FareSummary } from './FareSummary';
import { BonusSelector } from './BonusSelector';
import { RideTimingSelector, type RideTimingMode } from './RideTimingSelector';
const PaymentMethodSelector = dynamic(() => import('@/components/stripe/PaymentMethodSelector').then(m => ({ default: m.PaymentMethodSelector })), { ssr: false, loading: () => <div className="w-full h-24 bg-white/10 animate-pulse rounded-xl" /> })
const StripePaymentElement = dynamic(() => import('@/components/stripe/StripePaymentElement').then(m => ({ default: m.StripePaymentElement })), { ssr: false, loading: () => <div className="w-full h-48 bg-white/10 animate-pulse rounded-xl" /> })
import { logger } from '@/utils/logger';
import { CURRENCY_CODE } from '@/utils/constants';
import { formatCurrencyWithCode } from '@/utils/format';
import type { BookingStatus } from '@/types/booking';
import type { StripePaymentMethod } from '@/types/stripe';

//  Schéma Zod de validation pour la création de course (medJira.md #85)
const BookingSchema = z.object({
  userId: z.string().min(1, 'UID utilisateur requis'),
  userEmail: z.string().email('Email invalide').nullable().optional(),
  rideMode: z.enum(['immediate', 'scheduled']),
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
  scheduledAt: z.date().nullable().optional(),
  bonus: z.number().min(0).optional(),
  bookedForSomeoneElse: z.boolean().optional(),
  passengerName: z.string().optional(),
  passengerPhone: z.string().optional(),
  passengerNotes: z.string().optional(),
});

interface NewRideFormProps {
  onBookingCreated?: (booking: {
    bookingId: string;
    pickup: string;
    destination: string;
    rideMode: RideTimingMode;
    autoSearch?: boolean;
    scheduledAt?: Date | null;
  }) => void;
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
  const [detailsCarType, setDetailsCarType] = useState<CarType | null>(null);
  const [carTypes, setCarTypes] = useState<CarType[]>([]);
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [rideMode, setRideMode] = useState<RideTimingMode>('immediate');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  // Nouveaux états pour Bonus et Recherche Auto
  const [bonus, setBonus] = useState(0);
  const [showBonus, setShowBonus] = useState(false);
  const [autoSearchEnabled, setAutoSearchEnabled] = useState(false);

  // États pour la réservation pour un tiers
  const [bookForSomeoneElse, setBookForSomeoneElse] = useState(false);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [passengerNotes, setPassengerNotes] = useState('');

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
  } = useCapacitorGeolocation();

  const { country: detectedCountry } = useCountryDetection({
    location: currentLocation,
    enabled: mapsLoaded,
  });

  const [loadingAddress, setLoadingAddress] = useState(false);

  const handleUseCurrentLocation = useCallback(async () => {
    try {
      await getCurrentPosition('booking');
    } catch (error) {
      logger.error('Erreur lors de la récupération de la position', { error });
    }
  }, [getCurrentPosition]);

  const buildScheduledAt = () => {
    if (!scheduledDate || !scheduledTime) return null;
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`);
    return Number.isNaN(scheduledAt.getTime()) ? null : scheduledAt;
  };

  const applyScheduledDefaults = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30, 0, 0);
    setScheduledDate(now.toISOString().slice(0, 10));
    setScheduledTime(now.toTimeString().slice(0, 5));
  };

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

  // Mode 'tracking' force enableHighAccuracy: true (GPS satellite). En 'booking',
  // Android peut se rabattre sur Wi-Fi/réseau et donner une précision ~500m.
  useEffect(() => {
    if (!mapsLoaded) return;
    getCurrentPosition('tracking');
  }, [mapsLoaded, getCurrentPosition]);

  useEffect(() => {
    if (!preciseLocation) return;

    setLoadingAddress(true);
    setPickupAccuracy(preciseLocation.accuracy);
    setCurrentLocation({ lat: preciseLocation.lat, lng: preciseLocation.lng });
    setPickupLocation(preciseLocation);

    const accuracyText =
      preciseLocation.accuracy <= 20 ? '📍 Précis' :
      preciseLocation.accuracy <= 50 ? '📍 OK' :
      'Imprécis';
    setPickupAddress(`${accuracyText} Ma position (±${Math.round(preciseLocation.accuracy)}m)`);
    console.log(`📍 [GPS] Précision: ${preciseLocation.accuracy.toFixed(1)}m`);

    let cancelled = false;

    // Filet de sécurité — couvre client 4s + serveur 12s + marge.
    const safetyTimer = setTimeout(() => {
      if (!cancelled) setLoadingAddress(false);
    }, 18000);

    reverseGeocodeAddress(preciseLocation.lat, preciseLocation.lng)
      .then((address) => {
        if (cancelled || !address) return;
        setPickupAddress(address);
      })
      .finally(() => {
        clearTimeout(safetyTimer);
        if (!cancelled) setLoadingAddress(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, [preciseLocation]);


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

    if (rideMode === 'scheduled') {
      const scheduledAt = buildScheduledAt();
      if (!scheduledDate || !scheduledTime || !scheduledAt) {
        setError('Veuillez choisir une date et une heure de départ');
        return;
      }

      const earliestAllowed = new Date(Date.now() + 5 * 60 * 1000);
      if (scheduledAt < earliestAllowed) {
        setError('La réservation doit être programmée au moins 5 minutes à l\'avance');
        return;
      }
    }

    if (bookForSomeoneElse) {
      if (!passengerName.trim()) {
        setError('Veuillez entrer le nom du passager');
        return;
      }
      if (!passengerPhone.trim() || passengerPhone.trim().length < 8) {
        setError('Veuillez entrer un numéro de téléphone valide pour le passager');
        return;
      }
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
        const getBalance = httpsCallable<unknown, { balance: number; currency: string }>(
          functions, 'walletGetBalance'
        );
        const result = await getBalance({});
        const data = result.data;
        setWalletBalance(data.balance ?? 0);
        setWalletCurrency(data.currency ?? 'CAD');
        if (data.balance >= ((estimate?.price ?? 0) + bonus)) {
          setSelectedPaymentMethod('wallet');
        } else {
          setSelectedPaymentMethod('card');
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
      const createPiFn = httpsCallable<{ action: string; bookingId: string; amount: number }, { clientSecret: string }>(functions, 'stripePaymentIntent');
      const piResult = await createPiFn({
        action: 'create',
        bookingId,
        amount: (estimate.price ?? 0) + (bonus > 0 ? bonus : 0),
      });

      const { clientSecret } = piResult.data;
      setStripeClientSecret(clientSecret);
      setPendingBookingId(bookingId);
      setModalStep('stripe');
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      const isConnectionErr = /connection to Stripe|retried\s+\d+\s+times|ECONNRESET|ETIMEDOUT|network/i.test(raw);
      const msg = isConnectionErr
        ? 'Impossible de joindre Stripe pour le moment. Vérifiez votre connexion et réessayez dans quelques instants.'
        : raw || 'Erreur lors de la configuration du paiement';
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
      onBookingCreated({
        bookingId: pendingBookingId,
        pickup: pickupAddress,
        destination: destinationAddress,
        rideMode,
        autoSearch: rideMode === 'immediate' ? autoSearchEnabled : false,
        scheduledAt: rideMode === 'scheduled' ? buildScheduledAt() : null,
      });
    }
    if (rideMode === 'immediate' && onSearchDriver) onSearchDriver();
  };

  // Crée la réservation Firestore avec la méthode de paiement choisie
  const createBookingInternal = async (paymentMethod: StripePaymentMethod): Promise<string | null> => {
    try {
      const bookingStatus: BookingStatus = rideMode === 'scheduled' ? 'scheduled' : 'pending';
      const bookingData = {
        userId: currentUser!.uid,
        userEmail: currentUser!.email,
        rideMode,
        pickup: pickupAddress,
        destination: destinationAddress,
        pickupLocation: pickupLocation || undefined,
        pickupLocationAccuracy: pickupAccuracy || undefined,
        destinationLocation: destinationLocation || undefined,
        distance: estimate!.distance,
        duration: estimate!.duration,
        price: estimate!.price,
        carType: selectedCarType!.name,
        status: bookingStatus,
        scheduledAt: rideMode === 'scheduled' ? buildScheduledAt() || undefined : undefined,
        paymentMethod,
        ...(bonus > 0 && { bonus }),
        ...(rideMode === 'immediate' && autoSearchEnabled && {
          automaticSearch: { enabled: true, intervalSeconds: 60, attemptCount: 0, maxAttempts: 10 },
        }),
        ...(bookForSomeoneElse && {
          bookedForSomeoneElse: true,
          passengerName: passengerName.trim(),
          passengerPhone: passengerPhone.trim(),
          passengerNotes: passengerNotes.trim() || undefined,
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
        onBookingCreated({
          bookingId,
          pickup: pickupAddress,
          destination: destinationAddress,
          rideMode,
          autoSearch: rideMode === 'immediate' ? autoSearchEnabled : false,
          scheduledAt: rideMode === 'scheduled' ? buildScheduledAt() : null,
        });
      }
      if (rideMode === 'immediate' && onSearchDriver) {
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
      <form id="taxi-booking-form" onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
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
          countryRestriction={detectedCountry ? [detectedCountry.toLowerCase()] : undefined}
        />

        <div className="flex justify-start -mt-1">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={geoLoading || loadingAddress}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {geoLoading || loadingAddress ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                Détection en cours
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 21s6-4.35 6-10a6 6 0 10-12 0c0 5.65 6 10 6 10z" />
                  <circle cx="12" cy="11" r="2.25" />
                </svg>
                Utiliser ma position
              </>
            )}
          </button>
        </div>

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
          countryRestriction={detectedCountry ? [detectedCountry.toLowerCase()] : undefined}
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
                  estimatedPrice={selectedCarType?.id === carType.id ? estimate?.price ?? null : null}
                  onSelect={async (carType) => {
                    await triggerHaptic(ImpactStyle.Light); //  Haptic feedback (medJira.md #93)
                    setSelectedCarType(carType);
                  }}
                  onShowDetails={(carType) => setDetailsCarType(carType)}
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
        <RideTimingSelector
          mode={rideMode}
          scheduledDate={scheduledDate}
          scheduledTime={scheduledTime}
          onModeChange={(mode) => {
            setRideMode(mode);
            setError(null);
            if (mode === 'scheduled' && (!scheduledDate || !scheduledTime)) {
              applyScheduledDefaults();
            }
          }}
          onScheduledDateChange={setScheduledDate}
          onScheduledTimeChange={setScheduledTime}
        />

        <div className="space-y-3 pt-2 border-t border-white/[0.05]">
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
              <div className="mt-2.5 p-3.5 bg-[#1A1A1A] rounded-xl border border-white/[0.05]">
                <BonusSelector
                  selectedBonus={bonus}
                  onSelect={setBonus}
                />
              </div>
            )}
          </div>

          {/* Toggle Recherche Auto */}
          {rideMode === 'immediate' && (
            <div className="flex items-center gap-3 p-2.5 bg-[#3B82F6]/10 rounded-xl border border-[#3B82F6]/20">
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
          )}

          {/* Toggle Réservation pour un tiers */}
          <div>
            <div className="flex items-center gap-3 p-2.5 bg-[#f29200]/10 rounded-xl border border-[#f29200]/20">
              <div className="flex items-center h-5">
                <input
                  id="book-someone-else"
                  type="checkbox"
                  checked={bookForSomeoneElse}
                  onChange={(e) => setBookForSomeoneElse(e.target.checked)}
                  className="w-5 h-5 text-[#f29200] border-white/[0.08] rounded focus:ring-[#f29200]"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="book-someone-else" className="text-sm font-medium text-white cursor-pointer">
                  Cette course est pour quelqu&apos;un d&apos;autre
                </label>
                <p className="text-xs text-[#9CA3AF]">
                  Le passager recevra les informations du chauffeur par SMS.
                </p>
              </div>
            </div>

            {bookForSomeoneElse && (
              <div className="mt-2.5 p-3.5 bg-[#1A1A1A] rounded-xl border border-[#f29200]/20 space-y-2.5">
                <div>
                  <label htmlFor="passenger-name" className="block text-sm font-medium text-[#9CA3AF] mb-1">
                    Nom du passager <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="passenger-name"
                    type="text"
                    value={passengerName}
                    onChange={(e) => setPassengerName(e.target.value)}
                    placeholder="Ex: Jean Dupont"
                    className="w-full px-4 py-3 bg-[#0F0F0F] border border-white/[0.08] rounded-lg text-white placeholder:text-[#555] focus:outline-none focus:ring-2 focus:ring-[#f29200]/50 focus:border-[#f29200]/50 transition"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="passenger-phone" className="block text-sm font-medium text-[#9CA3AF] mb-1">
                    Téléphone du passager <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="passenger-phone"
                    type="tel"
                    value={passengerPhone}
                    onChange={(e) => setPassengerPhone(e.target.value)}
                    placeholder="+1 514 123 4567"
                    className="w-full px-4 py-3 bg-[#0F0F0F] border border-white/[0.08] rounded-lg text-white placeholder:text-[#555] focus:outline-none focus:ring-2 focus:ring-[#f29200]/50 focus:border-[#f29200]/50 transition"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="passenger-notes" className="block text-sm font-medium text-[#9CA3AF] mb-1">
                    Notes pour le chauffeur <span className="text-[#555]">(optionnel)</span>
                  </label>
                  <textarea
                    id="passenger-notes"
                    value={passengerNotes}
                    onChange={(e) => setPassengerNotes(e.target.value)}
                    placeholder="Ex: Porte rouge, 3e étage..."
                    rows={2}
                    className="w-full px-4 py-3 bg-[#0F0F0F] border border-white/[0.08] rounded-lg text-white placeholder:text-[#555] focus:outline-none focus:ring-2 focus:ring-[#f29200]/50 focus:border-[#f29200]/50 transition resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Message d'erreur */}
        {error && (
          <div className="p-3 bg-[#EF4444]/10 border-l-4 border-red-500 text-[#EF4444] rounded">
            <p>{error}</p>
          </div>
        )}

      </form>

      {/* Bouton de soumission - Sticky au-dessus de la BottomNav */}
      <div className="sticky bottom-24 left-0 right-0 z-10 mt-4">
        <button
          type="submit"
          form="taxi-booking-form"
          disabled={!pickupAddress || !destinationAddress || !selectedCarType || !estimate || loading || estimating}
          className="w-full bg-gradient-to-r from-[#f29200] to-[#ffae33] active:scale-[0.98] text-white font-bold py-4 px-6 rounded-2xl transition-transform disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation text-base sm:text-lg primary-glow"
          style={{ minHeight: '48px' }}
        >
          {loading ? 'Création en cours...' : 'Demander une course'}
        </button>
      </div>

      {/* Bottom sheet description véhicule */}
      {detailsCarType && (
        <VehicleDetailsSheet
          carType={detailsCarType}
          onClose={() => setDetailsCarType(null)}
        />
      )}

      {/* Modal de confirmation */}
      {showConfirmModal && estimate && selectedCarType && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-lg flex items-center justify-center p-2 sm:p-4 z-[60] transition-opacity duration-300">
          <div className="bg-[#1A1A1A] rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl transform transition-all duration-300 scale-100">
            {/* Header */}
            <div className="relative overflow-hidden p-4 sm:p-6 border-b border-white/[0.06]">
              <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/25 blur-3xl rounded-full pointer-events-none" />
              <div className="absolute -bottom-16 -left-10 w-32 h-32 bg-primary/10 blur-3xl rounded-full pointer-events-none" />
              <div className="relative flex items-center gap-3">
                <div className="size-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary text-xl">🚕</span>
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white">Confirmer la course</h2>
                  <p className="text-xs text-slate-400">Vérifiez les détails avant de confirmer</p>
                </div>
              </div>
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
                <div className="relative overflow-hidden glass-card p-4 sm:p-5 rounded-2xl border border-primary/20">
                  <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/25 blur-3xl rounded-full pointer-events-none" />
                  <div className="relative flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Prix estimé</p>
                    <p className="text-2xl sm:text-3xl font-bold text-primary">
                      {estimate.price ? formatCurrencyWithCode(estimate.price) : `0 ${CURRENCY_CODE}`}
                    </p>
                  </div>
                  {bonus > 0 && (
                    <div className="relative mt-2 pt-2 border-t border-white/[0.06] flex justify-between items-center text-slate-300 text-sm">
                      <span>+ Bonus chauffeur</span>
                      <span className="font-bold text-primary">+{formatCurrencyWithCode(bonus)}</span>
                    </div>
                  )}
                  <p className="relative text-xs text-slate-500 mt-2">* Le prix final peut varier selon le trafic</p>
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

