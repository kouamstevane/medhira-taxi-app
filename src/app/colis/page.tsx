'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { useAuth } from '@/hooks/useAuth';
import { AddressInput } from '@/app/taxi/components/AddressInput';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav } from '@/components/ui/BottomNav';
import { NetworkStatusBanner } from '@/components/ui/NetworkStatusBanner';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  createParcelOrder,
  estimateParcelPrice,
  isCountrySupported,
  ParcelValidationError,
  PARCEL_SIZE_LABELS,
  type ParcelLocation,
  type ParcelSizeCategory,
} from '@/services/parcel.service';
import type { PlaceSuggestion } from '@/types';

type Step = 'form' | 'submitting' | 'success' | 'error';

const triggerHaptic = async (type: 'light' | 'medium' | 'success' | 'error') => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    switch (type) {
      case 'light':
        await Haptics.impact({ style: ImpactStyle.Light });
        break;
      case 'medium':
        await Haptics.impact({ style: ImpactStyle.Medium });
        break;
      case 'success':
        await Haptics.notification({ type: NotificationType.Success });
        break;
      case 'error':
        await Haptics.notification({ type: NotificationType.Error });
        break;
    }
  } catch {
    // Haptic not available
  }
};

interface FormData {
  pickupAddress: string;
  pickupLocation: ParcelLocation | null;
  dropoffAddress: string;
  dropoffLocation: ParcelLocation | null;
  sizeCategory: ParcelSizeCategory;
  description: string;
  recipientName: string;
  recipientPhone: string;
  pickupInstructions: string;
}

const initialFormData: FormData = {
  pickupAddress: '',
  pickupLocation: null,
  dropoffAddress: '',
  dropoffLocation: null,
  sizeCategory: 'small',
  description: '',
  recipientName: '',
  recipientPhone: '',
  pickupInstructions: '',
};

export default function ColisPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { isLoaded, loadError, autocompleteService } = useGoogleMaps();

  const [step, setStep] = useState<Step>('form');
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [priceEstimate, setPriceEstimate] = useState<{ price: number; distance: number; duration: number; currency: string } | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const geocodePlace = useCallback(async (suggestion: PlaceSuggestion): Promise<ParcelLocation | null> => {
    if (!window.google?.maps?.Geocoder) return null;
    try {
      const geocoder = new window.google.maps.Geocoder();
      const result = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
        geocoder.geocode({ placeId: suggestion.place_id }, (results, status) => {
          if (status === 'OK' && results && results.length > 0) {
            resolve(results);
          } else {
            reject(new Error('Geocoding failed'));
          }
        });
      });
      const first = result[0];
      const loc = first.geometry.location;
      const countryComp = first.address_components.find((c) => c.types.includes('country'));
      const country = countryComp?.short_name || '';
      return {
        address: suggestion.description,
        latitude: loc.lat(),
        longitude: loc.lng(),
        country,
      };
    } catch {
      return null;
    }
  }, []);

  const updatePriceEstimate = useCallback(async () => {
    if (!formData.pickupLocation || !formData.dropoffLocation) {
      setPriceEstimate(null);
      return;
    }
    // Validation pays côté client avant l'appel Distance Matrix
    const pickupOk = isCountrySupported(formData.pickupLocation.country);
    const dropoffOk = isCountrySupported(formData.dropoffLocation.country);
    if (!pickupOk || !dropoffOk) {
      setPriceEstimate(null);
      setFieldErrors((prev) => ({
        ...prev,
        ...(pickupOk ? {} : { pickup: 'Service disponible uniquement au Cameroun et au Canada' }),
        ...(dropoffOk ? {} : { dropoff: 'Service disponible uniquement au Cameroun et au Canada' }),
      }));
      return;
    }
    if (formData.pickupLocation.country !== formData.dropoffLocation.country) {
      setPriceEstimate(null);
      setFieldErrors((prev) => ({
        ...prev,
        dropoff: 'Transport national uniquement — retrait et livraison doivent être dans le même pays',
      }));
      return;
    }
    setFieldErrors((prev) => {
      const { pickup: _p, dropoff: _d, ...rest } = prev;
      return rest;
    });
    setPriceLoading(true);
    try {
      const estimate = await estimateParcelPrice(
        formData.pickupLocation,
        formData.dropoffLocation,
        formData.sizeCategory
      );
      setPriceEstimate({ ...estimate, currency: estimate.currency });
    } catch (err) {
      setPriceEstimate(null);
      if (err instanceof ParcelValidationError && err.field) {
        setFieldErrors((prev) => ({ ...prev, [err.field!]: err.message }));
      }
    } finally {
      setPriceLoading(false);
    }
  }, [formData.pickupLocation, formData.dropoffLocation, formData.sizeCategory]);

  useEffect(() => {
    updatePriceEstimate();
  }, [updatePriceEstimate]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.pickupLocation) errors.pickup = "L'adresse de retrait est requise";
    if (!formData.dropoffLocation) errors.dropoff = "L'adresse de livraison est requise";
    if (formData.description.trim().length < 3) errors.description = 'Décrivez brièvement le colis';
    if (formData.recipientName.trim().length < 2) errors.recipientName = 'Le nom du destinataire est requis';
    if (formData.recipientPhone.trim().length < 8) errors.recipientPhone = 'Numéro de téléphone invalide';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!currentUser) {
      setErrorMsg('Vous devez être connecté pour demander le transport d\'un colis');
      return;
    }
    if (!validate()) {
      await triggerHaptic('error');
      return;
    }

    setStep('submitting');
    setErrorMsg(null);

    try {
      const parcelId = await createParcelOrder({
        senderId: currentUser.uid,
        recipientName: formData.recipientName.trim(),
        recipientPhone: formData.recipientPhone.trim(),
        pickupLocation: formData.pickupLocation!,
        dropoffLocation: formData.dropoffLocation!,
        description: formData.description.trim(),
        weight: PARCEL_SIZE_LABELS[formData.sizeCategory].weightMax,
        sizeCategory: formData.sizeCategory,
        pickupInstructions: formData.pickupInstructions.trim() || undefined,
      });

      await triggerHaptic('success');
      setStep('success');
    } catch (err) {
      await triggerHaptic('error');
      if (err instanceof ParcelValidationError) {
        setErrorMsg(err.message);
        if (err.field) {
          setFieldErrors((prev) => ({ ...prev, [err.field!]: err.message }));
        }
        setStep('form');
        return;
      }
      const message = err instanceof Error ? err.message : 'Une erreur est survenue lors de la création du colis';
      setErrorMsg(message);
      setStep('error');
    }
  };

  if (!isLoaded && !loadError) {
    return (
      <div className="min-h-screen bg-background max-w-[430px] mx-auto">
        <div className="bg-background/80 backdrop-blur-xl border-b border-white/5 p-4 sticky top-0 z-20 flex items-center justify-between">
          <div className="size-10" />
          <Skeleton className="h-6 w-32" />
          <div className="w-10" />
        </div>
        <div className="p-4 space-y-6">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
        <BottomNav />
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-background max-w-[430px] mx-auto flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="glass-card w-full p-8 rounded-2xl border border-white/10 text-center">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto border border-green-500/20 mb-5">
              <MaterialIcon name="check_circle" className="text-green-500 text-[32px]" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Demande enregistrée !</h2>
            <p className="text-sm text-slate-400 mb-6">
              Votre demande de transport a été créée. Un chauffeur sera bientôt assigné.
            </p>
            {priceEstimate && (
              <div className="glass-card p-4 rounded-xl border border-white/5 mb-6">
                <div className="flex justify-between items-center text-lg font-bold text-white">
                  <span>Prix estimé</span>
                  <span>{priceEstimate.price.toFixed(2)} {priceEstimate.currency}</span>
                </div>
              </div>
            )}
            <button
              onClick={() => router.push('/historique')}
              className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <MaterialIcon name="receipt_long" size="md" />
              Voir mes colis
            </button>
            <button
              onClick={() => {
                setStep('form');
                setFormData(initialFormData);
                setPriceEstimate(null);
                setFieldErrors({});
                setErrorMsg(null);
              }}
              className="w-full mt-3 h-14 glass-card text-slate-300 font-semibold rounded-2xl border border-white/10 active:scale-[0.98] transition-transform flex items-center justify-center"
            >
              Nouveau transport
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32 max-w-[430px] mx-auto">
      <NetworkStatusBanner />

      <header className="bg-background/80 backdrop-blur-xl border-b border-white/5 p-4 sticky top-0 z-20 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center size-10 rounded-full glass-card text-white active:scale-95 transition-transform"
        >
          <MaterialIcon name="arrow_back" size="md" />
        </button>
        <h1 className="text-lg font-bold text-white">Transport de colis</h1>
        <div className="w-10" />
      </header>

      <main className="px-4 py-6 space-y-5">
        {loadError && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
            <p className="text-sm text-yellow-400">{loadError}</p>
          </div>
        )}

        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 flex items-start gap-2">
          <MaterialIcon name="info" size="sm" className="text-blue-400 mt-0.5" />
          <p className="text-xs text-blue-300/90">
            Service de transport de colis <strong>urbain et national</strong> au Cameroun et au Canada.
            Le transport à l&apos;international n&apos;est pas pris en charge.
          </p>
        </div>

        <section className="glass-card p-5 rounded-2xl border border-white/5 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MaterialIcon name="swap_vert" className="text-primary" />
            Adresses
          </h2>

          <AddressInput
            label="Adresse de retrait"
            value={formData.pickupAddress}
            onChange={(val) => setFormData((prev) => ({ ...prev, pickupAddress: val, pickupLocation: null }))}
            onSelect={async (suggestion) => {
              const loc = await geocodePlace(suggestion);
              if (loc) {
                setFormData((prev) => ({ ...prev, pickupLocation: loc }));
              }
            }}
            placeholder="Où récupérer le colis ?"
            autocompleteService={autocompleteService}
            error={fieldErrors.pickup}
          />

          <AddressInput
            label="Adresse de livraison"
            value={formData.dropoffAddress}
            onChange={(val) => setFormData((prev) => ({ ...prev, dropoffAddress: val, dropoffLocation: null }))}
            onSelect={async (suggestion) => {
              const loc = await geocodePlace(suggestion);
              if (loc) {
                setFormData((prev) => ({ ...prev, dropoffLocation: loc }));
              }
            }}
            placeholder="Où livrer le colis ?"
            autocompleteService={autocompleteService}
            error={fieldErrors.dropoff}
          />
        </section>

        <section className="glass-card p-5 rounded-2xl border border-white/5 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MaterialIcon name="inventory_2" className="text-primary" />
            Taille du colis
          </h2>
          <div className="space-y-3">
            {(Object.entries(PARCEL_SIZE_LABELS) as [ParcelSizeCategory, typeof PARCEL_SIZE_LABELS[ParcelSizeCategory]][]).map(
              ([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={async () => {
                    setFormData((prev) => ({ ...prev, sizeCategory: key }));
                    await triggerHaptic('light');
                  }}
                  className={[
                    'w-full p-4 rounded-xl border text-left transition-all',
                    formData.sizeCategory === key
                      ? 'border-primary bg-primary/10'
                      : 'border-white/10',
                  ].join(' ')}
                >
                  <p className="text-sm font-medium text-white">{info.label}</p>
                  <p className="text-xs text-slate-400">{info.description}</p>
                </button>
              )
            )}
          </div>
        </section>

        <section className="glass-card p-5 rounded-2xl border border-white/5 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MaterialIcon name="description" className="text-primary" />
            Détails
          </h2>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Description du colis <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Ex: Documents, cadeau, matériel électronique…"
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
              style={{ fontSize: '16px' }}
              rows={2}
              maxLength={200}
            />
            {fieldErrors.description && (
              <p className="mt-1 text-sm text-red-500">{fieldErrors.description}</p>
            )}
          </div>
        </section>

        <section className="glass-card p-5 rounded-2xl border border-white/5 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MaterialIcon name="person" className="text-primary" />
            Destinataire
          </h2>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Nom du destinataire <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.recipientName}
              onChange={(e) => setFormData((prev) => ({ ...prev, recipientName: e.target.value }))}
              placeholder="Nom complet"
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              style={{ fontSize: '16px' }}
            />
            {fieldErrors.recipientName && (
              <p className="mt-1 text-sm text-red-500">{fieldErrors.recipientName}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Téléphone du destinataire <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={formData.recipientPhone}
              onChange={(e) => setFormData((prev) => ({ ...prev, recipientPhone: e.target.value }))}
              placeholder="+1 555 012 3456"
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              style={{ fontSize: '16px' }}
            />
            {fieldErrors.recipientPhone && (
              <p className="mt-1 text-sm text-red-500">{fieldErrors.recipientPhone}</p>
            )}
          </div>
        </section>

        <section className="glass-card p-5 rounded-2xl border border-white/5 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MaterialIcon name="note" className="text-primary" />
            Instructions de retrait
            <span className="text-xs text-slate-500 font-normal">(optionnel)</span>
          </h2>
          <textarea
            value={formData.pickupInstructions}
            onChange={(e) => setFormData((prev) => ({ ...prev, pickupInstructions: e.target.value }))}
            placeholder="Ex: Sonner à l'entrée, 3e étage…"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
            style={{ fontSize: '16px' }}
            rows={2}
            maxLength={200}
          />
        </section>

        {priceEstimate && !priceLoading && (
          <section className="glass-card p-5 rounded-2xl border border-primary/20 bg-primary/5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
              <MaterialIcon name="local_shipping" className="text-primary" />
              Estimation
            </h2>
            <div className="space-y-2 text-sm text-slate-400">
              <div className="flex justify-between">
                <span>Distance</span>
                <span className="text-white">{priceEstimate.distance.toFixed(1)} km</span>
              </div>
              <div className="flex justify-between">
                <span>Durée estimée</span>
                <span className="text-white">~{priceEstimate.duration} min</span>
              </div>
              <div className="border-t border-white/10 pt-3 flex justify-between items-center text-lg font-bold text-white">
                <span>Prix estimé</span>
                <span className="text-primary">{priceEstimate.price.toFixed(2)} {priceEstimate.currency}</span>
              </div>
            </div>
          </section>
        )}

        {priceLoading && (
          <div className="glass-card p-5 rounded-2xl border border-white/5 flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary" />
            <span className="text-sm text-slate-400">Calcul du prix…</span>
          </div>
        )}

        {errorMsg && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-xl text-sm border border-destructive/20">
            {errorMsg}
          </div>
        )}

        <div className="mt-4">
          <button
            onClick={handleSubmit}
            disabled={step === 'submitting' || !formData.pickupLocation || !formData.dropoffLocation}
            className="w-full bg-gradient-to-r from-primary to-[#ffae33] active:scale-[0.98] text-white font-bold py-4 px-6 rounded-2xl transition-transform disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation text-base sm:text-lg primary-glow flex justify-center items-center gap-2"
            style={{ minHeight: '48px' }}
          >
            {step === 'submitting' ? (
              <>
                <MaterialIcon name="progress_activity" size="md" className="animate-spin" />
                Création en cours…
              </>
            ) : priceEstimate ? (
              `Confirmer — ${priceEstimate.price.toFixed(2)} ${priceEstimate.currency}`
            ) : (
              'Confirmer le transport'
            )}
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
