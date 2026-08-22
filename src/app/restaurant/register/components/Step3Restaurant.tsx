'use client';

import { useState, FormEvent, useCallback, useEffect, useRef } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { InputField } from '@/components/forms/InputField';
import { TextAreaField } from '@/components/forms/TextAreaField';
import { cn } from '@/lib/utils';
import { driverPrimaryButtonClassName, driverSecondaryButtonClassName } from '@/app/driver/register/components/driverOnboardingStyles';
import { CUISINE_TYPES } from '@/utils/restaurant-constants';
import type { Step3Data } from '@/hooks/useRestaurantRegistration';
import { CURRENCY_CODE } from '@/utils/constants';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { AddressInput } from '@/app/taxi/components/AddressInput';
import { PlaceSuggestion } from '@/types';
import { RestaurantVisualPicker } from '@/components/food/RestaurantVisualPicker';

interface Step3RestaurantProps {
  onNext: (data: Step3Data) => void;
  onBack: () => void;
  initialData?: Partial<Step3Data>;
  loading: boolean;
}

export function Step3Restaurant({ onNext, onBack, initialData, loading }: Step3RestaurantProps) {
  const { autocompleteService } = useGoogleMaps();
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [cuisineType, setCuisineType] = useState<string[]>(initialData?.cuisineType || []);
  const [address, setAddress] = useState(initialData?.address || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [avgPrice, setAvgPrice] = useState(initialData?.avgPricePerPerson?.toString() || '');
  const [location, setLocation] = useState(initialData?.location);
  const [logoFile, setLogoFile] = useState<File | null>(initialData?.logoFile ?? null);
  const [coverFile, setCoverFile] = useState<File | null>(initialData?.coverFile ?? null);
  const [logoRemoved, setLogoRemoved] = useState(Boolean(initialData?.logoRemoved));
  const [coverRemoved, setCoverRemoved] = useState(Boolean(initialData?.coverRemoved));
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const errorElement = errorRef.current;
    if (!errorElement || !error) return;

    errorElement.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    errorElement.focus({ preventScroll: true });
  }, [error]);

  const toggleCuisine = (cuisine: string) => {
    setCuisineType((prev) =>
      prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]
    );
  };

  const handleAddressSelect = useCallback((suggestion: PlaceSuggestion) => {
    setAddress(suggestion.description);
    const googleApi = typeof window !== 'undefined' ? window.google : undefined;
    if (googleApi?.maps?.Geocoder && suggestion.place_id) {
      const geocoder = new googleApi.maps.Geocoder();
      geocoder.geocode({ placeId: suggestion.place_id }, (results, status) => {
        if (status === 'OK' && results && results[0]?.geometry?.location) {
          const loc = results[0].geometry.location;
          setLocation({ lat: loc.lat(), lng: loc.lng() });
        }
      });
    }
  }, []);

  const handleLocationResolved = useCallback((locObj: { lat: number; lng: number }, resolvedAddress: string) => {
    setLocation({ lat: locObj.lat, lng: locObj.lng });
    setAddress(resolvedAddress);
  }, []);

  const geocodeAddress = async (value: string): Promise<{ lat: number; lng: number } | null> => {
    if (location && value.trim() === address.trim()) return location;
    const googleApi = typeof window !== 'undefined' ? window.google : undefined;
    if (!googleApi?.maps?.Geocoder) return null;

    const geocoder = new googleApi.maps.Geocoder();
    const response = await geocoder.geocode({ address: value });
    const result = response.results?.[0]?.geometry?.location;
    if (!result) return null;
    return { lat: result.lat(), lng: result.lng() };
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Le nom du restaurant est requis.'); return; }
    if (!description.trim() || description.trim().length < 10) { setError('La description doit contenir au moins 10 caractères.'); return; }
    if (cuisineType.length === 0) { setError('Sélectionnez au moins un type de cuisine.'); return; }
    if (!address.trim()) { setError("L'adresse est requise."); return; }
    if (!phone.trim()) { setError('Le téléphone est requis.'); return; }
    if (!email.trim()) { setError("L'email du restaurant est requis."); return; }

    const resolvedLocation = await geocodeAddress(address.trim()).catch(() => null);
    if (!resolvedLocation) {
      setError("Impossible de vérifier les coordonnées de cette adresse. Vérifiez l'adresse puis réessayez.");
      return;
    }
    setLocation(resolvedLocation);

    onNext({
      name: name.trim(),
      description: description.trim(),
      cuisineType,
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      avgPricePerPerson: avgPrice ? parseFloat(avgPrice) : undefined,
      location: resolvedLocation,
      ...(logoFile ? { logoFile } : {}),
      ...(coverFile ? { coverFile } : {}),
      ...(logoRemoved ? { logoRemoved: true } : {}),
      ...(coverRemoved ? { coverRemoved: true } : {}),
    });
  };

  return (
    <div className="flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold mb-1 text-white">Votre restaurant</h2>
        <p className="text-gray-400 mb-6">Étape 3 sur 4 — Informations du restaurant</p>

        {error && (
          <div
            ref={errorRef}
            className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            tabIndex={-1}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <InputField id="restName" type="text" label="Nom du restaurant" aria-label="Nom du restaurant" value={name} onChange={(e) => setName(e.target.value)} placeholder="Le Bistrot Parisien" required aria-required="true" />

          <TextAreaField id="restDesc" label="Description" aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[100px]" placeholder="Décrivez votre restaurant en quelques phrases..." required aria-required="true" />

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Types de cuisine</label>
            <div className="flex flex-wrap gap-2">
              {CUISINE_TYPES.map((cuisine) => (
                <button
                  key={cuisine}
                  type="button"
                  onClick={() => toggleCuisine(cuisine)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    cuisineType.includes(cuisine)
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  aria-pressed={cuisineType.includes(cuisine)}
                >
                  {cuisine}
                </button>
              ))}
            </div>
          </div>

          <div>
            <AddressInput
              label="Adresse du restaurant"
              value={address}
              onChange={(val) => {
                setAddress(val);
                setLocation(undefined);
              }}
              onSelect={handleAddressSelect}
              autocompleteService={autocompleteService}
              location={location}
              enableLocationButton={true}
              onLocationResolved={handleLocationResolved}
              placeholder="12 Rue de la Paix, 75002 Paris"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <InputField id="restPhone" type="tel" label="Téléphone" aria-label="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 1 42 86 00 88" required aria-required="true" containerClassName="min-w-0" />
            <InputField id="restEmail" type="email" label="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@bistro.fr" required aria-required="true" containerClassName="min-w-0" />
          </div>

          <InputField id="avgPrice" type="number" label={`Prix moyen par personne (${CURRENCY_CODE}, optionnel)`} value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} placeholder="25" min="0" step="1" />

          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div>
              <h3 className="text-base font-semibold text-white">Identité visuelle</h3>
              <p className="mt-1 text-xs text-gray-400">Ces visuels aideront les clients à reconnaître votre établissement.</p>
            </div>
            <RestaurantVisualPicker
              kind="logo"
              currentUrl={initialData?.logoUrl}
              onChange={(file, action) => {
                setLogoFile(file);
                setLogoRemoved(action === 'remove');
              }}
              disabled={loading}
            />
            <RestaurantVisualPicker
              kind="cover"
              currentUrl={initialData?.coverImageUrl || initialData?.imageUrl}
              onChange={(file, action) => {
                setCoverFile(file);
                setCoverRemoved(action === 'remove');
              }}
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onBack} className={cn(driverSecondaryButtonClassName, 'flex-1')} aria-label="Retour à l'étape précédente">
              Retour
            </button>
            <button type="submit" disabled={loading} className={cn(driverPrimaryButtonClassName, 'flex-[2] gap-2')} aria-label="Continuer aux horaires">
              {loading ? <span className="animate-spin">⏳</span> : <MaterialIcon name="arrow_forward" />}
               Continuer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
