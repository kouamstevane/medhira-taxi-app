'use client';

import { useState, FormEvent, useCallback, useEffect, useRef } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { InputField } from '@/components/forms/InputField';
import { TextAreaField } from '@/components/forms/TextAreaField';
import { cn } from '@/lib/utils';
import { driverPrimaryButtonClassName, driverSecondaryButtonClassName } from '@/app/driver/register/components/driverOnboardingStyles';
import {
  MERCHANT_TYPES_CONFIG,
  getCategoriesForMerchantType,
  type MerchantType,
} from '@/utils/restaurant-constants';
import type { Step3Data } from '@/hooks/useRestaurantRegistration';
import { CURRENCY_CODE } from '@/utils/constants';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { AddressInput } from '@/app/taxi/components/AddressInput';
import { PlaceSuggestion } from '@/types';
import { RestaurantVisualPicker } from '@/components/food/RestaurantVisualPicker';
import { useTranslation } from '@/hooks/useTranslation';

interface Step3RestaurantProps {
  onNext: (data: Step3Data) => void;
  onBack: () => void;
  initialData?: Partial<Step3Data>;
  loading: boolean;
}

type SectionKey = 'activity' | 'info' | 'location' | 'visuals';

export function Step3Restaurant({ onNext, onBack, initialData, loading }: Step3RestaurantProps) {
  const { t } = useTranslation('restaurant');
  const { autocompleteService } = useGoogleMaps();

  // Form states
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [merchantType, setMerchantType] = useState<MerchantType>(
    initialData?.merchantType || 'restaurant'
  );
  const [fulfillmentModes, setFulfillmentModes] = useState<('delivery' | 'pickup')[]>(
    initialData?.fulfillmentModes && initialData.fulfillmentModes.length > 0
      ? initialData.fulfillmentModes
      : ['delivery', 'pickup']
  );
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

  // Accordion state - only one accordion is open at a time (mutually exclusive)
  // Initially, only the first accordion (activity) is open upon arrival
  const [openSection, setOpenSection] = useState<SectionKey | null>('activity');

  // Preset categories for current merchant type
  const presetCategories = getCategoriesForMerchantType(merchantType);

  // Change merchant type confirmation modal state
  const [pendingMerchantType, setPendingMerchantType] = useState<MerchantType | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    const errorElement = errorRef.current;
    if (!errorElement || !error) return;

    errorElement.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    errorElement.focus({ preventScroll: true });
  }, [error]);

  // Auto-dismiss errors after 5 seconds so they never stay permanently fixed
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const toggleSection = (key: SectionKey) => {
    setOpenSection((current) => (current === key ? null : key));
  };

  const openSections: Record<SectionKey, boolean> = {
    activity: openSection === 'activity',
    info: openSection === 'info',
    location: openSection === 'location',
    visuals: openSection === 'visuals',
  };

  const toggleCuisine = (cuisine: string) => {
    if (cuisineType.includes(cuisine)) {
      setCuisineType((prev) => prev.filter((c) => c !== cuisine));
      return;
    }
    if (cuisineType.length >= 5) {
      const msg = t('maxCategoriesTotalError');
      setError(msg);
      return;
    }
    setCuisineType((prev) => [...prev, cuisine]);
  };

  const handleSelectMerchantType = (typeId: MerchantType) => {
    if (typeId === merchantType) return;
    if (cuisineType.length > 0) {
      setPendingMerchantType(typeId);
      setShowConfirmModal(true);
    } else {
      setMerchantType(typeId);
    }
  };

  const handleConfirmMerchantChange = () => {
    if (pendingMerchantType) {
      setMerchantType(pendingMerchantType);
      setCuisineType([]);
      setPendingMerchantType(null);
    }
    setShowConfirmModal(false);
  };

  const handleCancelMerchantChange = () => {
    setPendingMerchantType(null);
    setShowConfirmModal(false);
  };

  const toggleFulfillmentMode = (mode: 'delivery' | 'pickup') => {
    setFulfillmentModes((prev) => {
      if (prev.includes(mode)) {
        if (prev.length <= 1) return prev;
        return prev.filter((m) => m !== mode);
      }
      return [...prev, mode];
    });
  };

  const getMerchantTypeLabel = (id: MerchantType): string => {
    switch (id) {
      case 'restaurant':
        return t('merchantTypes.restaurant');
      case 'supermarket':
        return t('merchantTypes.supermarket');
      case 'pharmacy':
        return t('merchantTypes.pharmacy');
      case 'bakery':
        return t('merchantTypes.bakery');
      case 'retail':
        return t('merchantTypes.retail');
      case 'other':
      default:
        return t('merchantTypes.other');
    }
  };

  const getDynamicLabels = () => {
    const isRestaurant = merchantType === 'restaurant';
    const isFood = merchantType === 'restaurant' || merchantType === 'bakery';

    return {
      sectionInfoTitle: t('sectionInfo'),
      nameLabel: isRestaurant ? t('restaurantName') : t('businessName'),
      namePlaceholder: t(`merchantNamePlaceholders.${merchantType}` as never) || t('businessName'),
      descPlaceholder: isRestaurant ? t('descPlaceholder') : t('businessDescPlaceholder'),
      categoriesLabel: t('businessCategories'),
      addressLabel: isRestaurant ? t('restaurantAddress') : (t('businessAddress') || t('restaurantAddress')),
      phoneLabel: t('phone'),
      emailLabel: t('email'),
      avgPriceLabel: isFood
        ? t('avgPricePerPerson', { currency: CURRENCY_CODE })
        : t('estimatedBasket', { currency: CURRENCY_CODE }),
    };
  };

  const dynamicLabels = getDynamicLabels();

  // Completion statuses
  const isActivityCompleted = merchantType && fulfillmentModes.length > 0;
  const isInfoCompleted = name.trim().length > 0 && description.trim().length >= 10 && cuisineType.length > 0;
  const isLocationCompleted = address.trim().length > 0 && phone.trim().length > 0 && email.trim().length > 0;
  const isVisualsCompleted = Boolean(logoFile || coverFile || initialData?.logoUrl || initialData?.coverImageUrl || initialData?.imageUrl);

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

    if (!name.trim()) {
      const msg = merchantType === 'restaurant' ? t('restaurantNameRequired') : t('businessNameRequired');
      setError(msg);
      setOpenSection('info');
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      const msg = t('descMinLengthError');
      setError(msg);
      setOpenSection('info');
      return;
    }
    if (cuisineType.length === 0) {
      const msg = merchantType === 'restaurant' ? t('atLeastOneCuisineError') : t('atLeastOneCategoryError');
      setError(msg);
      setOpenSection('info');
      return;
    }
    if (fulfillmentModes.length === 0) {
      const msg = t('atLeastOneFulfillmentError');
      setError(msg);
      setOpenSection('activity');
      return;
    }
    if (!address.trim()) {
      const msg = t('addressRequired');
      setError(msg);
      setOpenSection('location');
      return;
    }
    if (!phone.trim()) {
      const msg = t('phoneRequired');
      setError(msg);
      setOpenSection('location');
      return;
    }
    if (!email.trim()) {
      const msg = t('restaurantEmailRequired');
      setError(msg);
      setOpenSection('location');
      return;
    }

    const resolvedLocation = await geocodeAddress(address.trim()).catch(() => null);
    if (!resolvedLocation) {
      const msg = t('geocodeError');
      setError(msg);
      setOpenSection('location');
      return;
    }
    setLocation(resolvedLocation);

    onNext({
      name: name.trim(),
      description: description.trim(),
      merchantType,
      fulfillmentModes,
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
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-white">{t('step3Title')}</h2>
          <p className="text-sm text-gray-400 mt-1">{t('step3Subtitle')}</p>
        </div>

        {error && (
          <div
            ref={errorRef}
            className="mb-5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center justify-between gap-2 transition-all duration-300 animate-in fade-in"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            tabIndex={-1}
          >
            <div className="flex items-center gap-2 min-w-0">
              <MaterialIcon name="error_outline" size="sm" className="text-red-400 shrink-0" />
              <span className="leading-snug">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="p-1 rounded-lg text-red-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              aria-label="Fermer l'alerte"
            >
              <MaterialIcon name="close" size="sm" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Section 1: Activité & modes de remise */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('activity')}
              aria-expanded={openSections.activity}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left bg-white/[0.01] hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0',
                    isActivityCompleted
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-primary/20 text-primary border border-primary/40'
                  )}
                >
                  {isActivityCompleted ? <MaterialIcon name="check" size="sm" /> : '1'}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                    {t('sectionActivity')}
                  </h3>
                  <p className="text-xs text-gray-400 truncate">
                    {getMerchantTypeLabel(merchantType)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span
                  className={cn(
                    'hidden sm:inline-flex text-[11px] px-2 py-0.5 rounded-full font-medium',
                    isActivityCompleted
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-white/[0.05] text-gray-400'
                  )}
                >
                  {isActivityCompleted ? t('sectionCompletedBadge') : t('sectionIncompleteBadge')}
                </span>
                <MaterialIcon
                  name={openSections.activity ? 'expand_less' : 'expand_more'}
                  size="sm"
                  className="text-gray-400"
                />
              </div>
            </button>

            <div
              className={cn(
                'p-4 sm:p-5 pt-0 space-y-4 border-t border-white/[0.04]',
                !openSections.activity && 'hidden'
              )}
            >
              <div className="pt-3">
                <label className="block text-sm font-medium text-gray-300 mb-2.5">
                  {t('merchantTypeLabel')}
                </label>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {MERCHANT_TYPES_CONFIG.map((typeOpt) => {
                    const isSelected = merchantType === typeOpt.id;
                    return (
                      <button
                        key={typeOpt.id}
                        type="button"
                        onClick={() => handleSelectMerchantType(typeOpt.id)}
                        className={cn(
                          'flex flex-col items-start justify-between p-3 rounded-xl border text-left transition-all min-h-[76px] relative overflow-hidden group',
                          isSelected
                            ? 'border-primary/60 bg-primary/10 text-white shadow-sm ring-1 ring-primary/40'
                            : 'border-white/[0.06] bg-white/[0.02] text-gray-300 hover:border-white/20 hover:bg-white/[0.05] hover:text-white'
                        )}
                        aria-pressed={isSelected}
                      >
                        <div className="flex items-center justify-between w-full mb-1.5">
                          <div
                            className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                              isSelected ? 'bg-primary/20 text-primary' : 'bg-white/[0.05] text-gray-400 group-hover:text-gray-200'
                            )}
                          >
                            <MaterialIcon name={typeOpt.icon} size="sm" />
                          </div>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-primary ring-4 ring-primary/20" />
                          )}
                        </div>
                        <span className="text-xs font-semibold leading-snug break-words">
                          {getMerchantTypeLabel(typeOpt.id)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fulfillment Modes Selection */}
              <div className="pt-2">
                <label className="block text-sm font-medium text-gray-300 mb-2.5">
                  {t('fulfillmentModesLabel')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => toggleFulfillmentMode('delivery')}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all min-h-[50px]',
                      fulfillmentModes.includes('delivery')
                        ? 'border-primary/60 bg-primary/10 text-white shadow-sm ring-1 ring-primary/30'
                        : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:border-white/20 hover:text-gray-200'
                    )}
                    aria-pressed={fulfillmentModes.includes('delivery')}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                          fulfillmentModes.includes('delivery') ? 'bg-primary/20 text-primary' : 'bg-white/[0.05] text-gray-400'
                        )}
                      >
                        <MaterialIcon name="delivery_dining" size="sm" />
                      </div>
                      <span className="font-semibold text-white">{t('deliveryModeDelivery')}</span>
                    </div>
                    {fulfillmentModes.includes('delivery') && (
                      <MaterialIcon name="check_circle" size="sm" className="text-primary shrink-0" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleFulfillmentMode('pickup')}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all min-h-[50px]',
                      fulfillmentModes.includes('pickup')
                        ? 'border-primary/60 bg-primary/10 text-white shadow-sm ring-1 ring-primary/30'
                        : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:border-white/20 hover:text-gray-200'
                    )}
                    aria-pressed={fulfillmentModes.includes('pickup')}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                          fulfillmentModes.includes('pickup') ? 'bg-primary/20 text-primary' : 'bg-white/[0.05] text-gray-400'
                        )}
                      >
                        <MaterialIcon name="storefront" size="sm" />
                      </div>
                      <span className="font-semibold text-white">{t('deliveryModePickup')}</span>
                    </div>
                    {fulfillmentModes.includes('pickup') && (
                      <MaterialIcon name="check_circle" size="sm" className="text-primary shrink-0" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Informations de l'établissement & Rayons */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('info')}
              aria-expanded={openSections.info}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left bg-white/[0.01] hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0',
                    isInfoCompleted
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-primary/20 text-primary border border-primary/40'
                  )}
                >
                  {isInfoCompleted ? <MaterialIcon name="check" size="sm" /> : '2'}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                    {dynamicLabels.sectionInfoTitle}
                  </h3>
                  <p className="text-xs text-gray-400 truncate">
                    {name ? `${name} • ${t('categoriesSelectedCount', { count: cuisineType.length })}` : t('sectionIncompleteBadge')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span
                  className={cn(
                    'hidden sm:inline-flex text-[11px] px-2 py-0.5 rounded-full font-medium',
                    isInfoCompleted
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-white/[0.05] text-gray-400'
                  )}
                >
                  {isInfoCompleted ? t('sectionCompletedBadge') : t('sectionIncompleteBadge')}
                </span>
                <MaterialIcon
                  name={openSections.info ? 'expand_less' : 'expand_more'}
                  size="sm"
                  className="text-gray-400"
                />
              </div>
            </button>

            <div
              className={cn(
                'p-4 sm:p-5 pt-0 space-y-4 border-t border-white/[0.04]',
                !openSections.info && 'hidden'
              )}
            >
              <div className="pt-3">
                <InputField
                  id="restName"
                  type="text"
                  label={dynamicLabels.nameLabel}
                  aria-label={dynamicLabels.nameLabel}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={dynamicLabels.namePlaceholder}
                  required
                  aria-required="true"
                />
              </div>

              <TextAreaField
                id="restDesc"
                label={t('description')}
                aria-label={t('description')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[90px]"
                placeholder={dynamicLabels.descPlaceholder}
                required
                aria-required="true"
              />

              {/* Categories / Spécialités adaptées */}
              <div className="pt-1">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="block text-sm font-medium text-gray-300">
                    {dynamicLabels.categoriesLabel}
                  </label>
                  <span className="text-xs text-gray-400 font-mono">
                    {cuisineType.length}/5
                  </span>
                </div>

                {/* Preset categories for current merchant type */}
                <div className="flex flex-wrap gap-2">
                  {presetCategories.map((cuisine) => {
                    const isSelected = cuisineType.includes(cuisine);
                    return (
                      <button
                        key={cuisine}
                        type="button"
                        onClick={() => toggleCuisine(cuisine)}
                        className={cn(
                          'px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all min-h-[36px] flex items-center gap-1.5',
                          isSelected
                            ? 'bg-primary text-white border border-primary shadow-sm shadow-primary/30 ring-1 ring-primary/40 font-semibold'
                            : 'bg-white/[0.03] text-gray-300 border border-white/[0.06] hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
                        )}
                        aria-pressed={isSelected}
                      >
                        {isSelected && <MaterialIcon name="check" size="sm" className="text-white shrink-0 -ml-0.5" />}
                        <span>{t(`presetCategories.${cuisine}` as never) || cuisine}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Coordonnées & Emplacement */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('location')}
              aria-expanded={openSections.location}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left bg-white/[0.01] hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0',
                    isLocationCompleted
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-primary/20 text-primary border border-primary/40'
                  )}
                >
                  {isLocationCompleted ? <MaterialIcon name="check" size="sm" /> : '3'}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                    {t('contactAndLocation')}
                  </h3>
                  <p className="text-xs text-gray-400 truncate">
                    {address || t('sectionIncompleteBadge')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span
                  className={cn(
                    'hidden sm:inline-flex text-[11px] px-2 py-0.5 rounded-full font-medium',
                    isLocationCompleted
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-white/[0.05] text-gray-400'
                  )}
                >
                  {isLocationCompleted ? t('sectionCompletedBadge') : t('sectionIncompleteBadge')}
                </span>
                <MaterialIcon
                  name={openSections.location ? 'expand_less' : 'expand_more'}
                  size="sm"
                  className="text-gray-400"
                />
              </div>
            </button>

            <div
              className={cn(
                'p-4 sm:p-5 pt-0 space-y-4 border-t border-white/[0.04]',
                !openSections.location && 'hidden'
              )}
            >
              <div className="pt-3">
                <AddressInput
                  label={dynamicLabels.addressLabel}
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
                  placeholder={t('addressPlaceholder')}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <InputField
                  id="restPhone"
                  type="tel"
                  label={dynamicLabels.phoneLabel}
                  aria-label={dynamicLabels.phoneLabel}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('phonePlaceholder')}
                  required
                  aria-required="true"
                  containerClassName="min-w-0"
                />
                <InputField
                  id="restEmail"
                  type="email"
                  label={dynamicLabels.emailLabel}
                  aria-label={dynamicLabels.emailLabel}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  required
                  aria-required="true"
                  containerClassName="min-w-0"
                />
              </div>

              <InputField
                id="avgPrice"
                type="number"
                label={dynamicLabels.avgPriceLabel}
                aria-label={dynamicLabels.avgPriceLabel}
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
                placeholder="25"
                min="0"
                step="1"
              />
            </div>
          </div>

          {/* Section 4: Identité visuelle */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('visuals')}
              aria-expanded={openSections.visuals}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left bg-white/[0.01] hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0',
                    isVisualsCompleted
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-primary/20 text-primary border border-primary/40'
                  )}
                >
                  {isVisualsCompleted ? <MaterialIcon name="check" size="sm" /> : '4'}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                    {t('sectionVisuals')}
                  </h3>
                  <p className="text-xs text-gray-400 truncate">
                    {isVisualsCompleted ? t('visualsConfiguredBadge') : t('visualIdentityDesc')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span
                  className={cn(
                    'hidden sm:inline-flex text-[11px] px-2 py-0.5 rounded-full font-medium',
                    isVisualsCompleted
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-white/[0.05] text-gray-400'
                  )}
                >
                  {isVisualsCompleted ? t('sectionCompletedBadge') : t('optionalBadge')}
                </span>
                <MaterialIcon
                  name={openSections.visuals ? 'expand_less' : 'expand_more'}
                  size="sm"
                  className="text-gray-400"
                />
              </div>
            </button>

            <div
              className={cn(
                'p-4 sm:p-5 pt-0 space-y-4 border-t border-white/[0.04]',
                !openSections.visuals && 'hidden'
              )}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
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
            </div>
          </div>

          {/* Section 5: Boutons d'action */}
          <div className="flex items-center gap-3 pt-4 pb-8">
            <button
              type="button"
              onClick={onBack}
              className={cn(
                driverSecondaryButtonClassName,
                'flex-1 gap-2 bg-white/[0.04] border-white/10 text-white hover:bg-white/[0.08] hover:border-white/20 active:scale-[0.98]'
              )}
              aria-label={t('backToPreviousStep')}
            >
              <MaterialIcon name="arrow_back" size="sm" />
              <span>{t('back')}</span>
            </button>
            <button
              type="submit"
              disabled={loading}
              className={cn(
                driverPrimaryButtonClassName,
                'flex-[1.5] gap-2 shadow-lg shadow-primary/20 active:scale-[0.98]'
              )}
              aria-label={t('continueToHours')}
            >
              {loading ? <span className="animate-spin">⏳</span> : <MaterialIcon name="arrow_forward" size="sm" />}
              <span>{t('continue')}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Modal: Changing Merchant Type */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          aria-describedby="confirm-modal-desc"
        >
          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#18181b] p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
              <MaterialIcon name="swap_horiz" size="md" />
            </div>

            <div className="text-center space-y-2">
              <h3 id="confirm-modal-title" className="text-base font-semibold text-white">
                {t('confirmChangeMerchantTypeTitle')}
              </h3>
              <p id="confirm-modal-desc" className="text-xs text-gray-400 leading-relaxed">
                {t('confirmChangeMerchantTypeDesc')}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleCancelMerchantChange}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-medium text-gray-300 bg-white/[0.06] hover:bg-white/10 border border-white/10 transition-colors min-h-[44px]"
              >
                {t('confirmChangeMerchantTypeCancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmMerchantChange}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary-hover shadow-md shadow-primary/20 transition-all min-h-[44px]"
              >
                {t('confirmChangeMerchantTypeConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
