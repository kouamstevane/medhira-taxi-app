"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Camera, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useToast } from '@/hooks/useToast';
import { InputField } from '@/components/forms/InputField';
import { ERROR_MESSAGES } from '@/utils/constants';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { AddressInput } from '@/app/taxi/components/AddressInput';
import { PlaceSuggestion } from '@/types';
import { isValidPhoneNumber } from '@/lib/validation';
import { cn } from '@/lib/utils';
import {
  driverPrimaryButtonClassName,
  driverSecondaryButtonClassName,
  driverSectionCardClassName,
  driverSectionTitleClassName,
} from './driverOnboardingStyles';
import {
  getCountryByDialCode,
  getCountryByCode,
  getCountryByName,
  getDialCodeForCountryCode,
  getDialCodeFromPhone,
} from './identity-utils';

const minDate = new Date();
minDate.setFullYear(minDate.getFullYear() - 18);

const step2Schema = z.object({
  firstName: z.string().min(2, "Prénom requis"),
  lastName: z.string().min(2, "Nom requis"),
  dob: z.string().min(1, "Date de naissance requise").refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && date <= minDate;
  }, "Vous devez avoir au moins 18 ans"),
  phone: z.string().refine((value) => isValidPhoneNumber(value), ERROR_MESSAGES.INVALID_PHONE),
  address: z.string().min(5, "Adresse de résidence requise"),
  city: z.string().min(1, "Ville requise"),
  zipCode: z.string().optional(),
  province: z.string().min(1, "Province/Région requise"),
  country: z.string().min(1, "Pays requis"),
});

export type Step2FormData = z.infer<typeof step2Schema>;

interface Step2IdentityProps {
  onNext: (data: Step2FormData, biometricsPhoto: File | null) => void;
  onBack: () => void;
  initialData?: Partial<Step2FormData>;
  initialPhoto?: File | null;
  loading?: boolean;
}

type LocationFeedback =
  | { type: 'success'; message: string }
  | { type: 'error'; message: string }
  | null;

interface CountryFields {
  city: string;
  zipCode: string;
  province: string;
  country: string;
  countryCode: string | null;
}

const driverInputClassName = 'bg-[#1A1A1A] text-white placeholder-[#4B5563] border-white/[0.08] focus:ring-[#f29200] focus:border-[#f29200]';
const dobInputClassName = `${driverInputClassName} min-w-0 w-full px-2.5 py-3 border rounded-xl outline-none transition-all duration-200 text-base text-center shadow-sm active:scale-[0.99]`;

function parseCountryFields(addressComponents: google.maps.GeocoderAddressComponent[]): CountryFields {
  let city = '';
  let zipCode = '';
  let province = '';
  let country = '';
  let countryCode: string | null = null;

  for (const component of addressComponents) {
    const types = component.types;
    if (types.includes('locality') || types.includes('sublocality') || types.includes('postal_town')) {
      city = component.long_name;
    }
    if (types.includes('postal_code')) {
      zipCode = component.long_name;
    }
    if (types.includes('administrative_area_level_1')) {
      province = component.long_name;
    }
    if (types.includes('country')) {
      country = component.long_name;
      countryCode = component.short_name;
    }
  }

  return { city, zipCode, province, country, countryCode };
}

export default function Step2Identity({ onNext, onBack, initialData, initialPhoto, loading }: Step2IdentityProps) {
  const { showError } = useToast();
  const { autocompleteService } = useGoogleMaps();

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<Step2FormData>({
    mode: 'onBlur',
    reValidateMode: 'onChange',
    resolver: zodResolver(step2Schema),
    defaultValues: {
      firstName: initialData?.firstName || '',
      lastName: initialData?.lastName || '',
      dob: initialData?.dob || '',
      phone: initialData?.phone || '',
      address: initialData?.address || '',
      city: initialData?.city || '',
      zipCode: initialData?.zipCode || '',
      province: initialData?.province || '',
      country: initialData?.country || '',
    }
  });

  const addressVal = watch('address') || '';
  const phoneVal = watch('phone') || '';
  const phoneTouchedRef = useRef(Boolean(initialData?.phone));
  const initialPhoneAppliedRef = useRef(Boolean(initialData?.phone));
  const initialCountryAppliedRef = useRef(false);
  const [phonePrefix, setPhonePrefix] = useState(() =>
    getDialCodeFromPhone(initialData?.phone)
    ?? getDialCodeForCountryCode(getCountryByName(initialData?.country)?.code ?? null)
    ?? ''
  );
  const phonePrefixRef = useRef(phonePrefix);
  const phoneAutoDetectRef = useRef(false);
  const [locationFeedback, setLocationFeedback] = useState<LocationFeedback>(null);
  const [isLocating, setIsLocating] = useState(false);

  const applyPhonePrefix = useCallback((countryCode?: string | null, force = false) => {
    const nextPrefix = getDialCodeForCountryCode(countryCode);
    setPhonePrefix(nextPrefix);

    if (!phoneTouchedRef.current || force) {
      setValue('phone', nextPrefix, { shouldValidate: false, shouldDirty: false });
    }
  }, [setValue]);

  useEffect(() => {
    if (initialData?.phone) {
      if (initialPhoneAppliedRef.current) {
        return;
      }

      initialPhoneAppliedRef.current = true;
      phoneTouchedRef.current = true;
      setPhonePrefix(
        getDialCodeFromPhone(initialData.phone)
        ?? getDialCodeForCountryCode(getCountryByName(initialData.country)?.code ?? null)
        ?? getDialCodeForCountryCode(null)
      );
      setValue('phone', initialData.phone, { shouldValidate: true, shouldDirty: false });
      return;
    }

    if (initialData?.country) {
      if (initialCountryAppliedRef.current) {
        return;
      }

      initialCountryAppliedRef.current = true;
      applyPhonePrefix(getCountryByName(initialData.country)?.code ?? null, true);
      return;
    }

    if (!phoneTouchedRef.current && (!phoneVal || phoneVal === phonePrefixRef.current)) {
      setValue('phone', phonePrefix, { shouldValidate: false, shouldDirty: false });
    }
    phonePrefixRef.current = phonePrefix;
  }, [applyPhonePrefix, initialData?.country, initialData?.phone, phonePrefix, phoneVal, setValue]);

  useEffect(() => {
    if (
      initialData?.phone ||
      initialData?.country ||
      phoneTouchedRef.current ||
      phonePrefix ||
      phoneAutoDetectRef.current ||
      typeof navigator === 'undefined' ||
      !navigator.geolocation ||
      !autocompleteService
    ) {
      return;
    }

    phoneAutoDetectRef.current = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (phoneTouchedRef.current || phonePrefixRef.current) return;
        if (!window.google?.maps?.Geocoder) return;

        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode(
          { location: { lat: position.coords.latitude, lng: position.coords.longitude } },
          (results, status) => {
            if (status === 'OK' && results && results.length > 0) {
              const countryComponent = results[0].address_components.find((component) =>
                component.types.includes('country')
              );
              const detectedCountry = countryComponent?.short_name ?? null;
              if (detectedCountry && !phoneTouchedRef.current) {
                applyPhonePrefix(detectedCountry, true);
              }
            }
          }
        );
      },
      () => {
        phoneAutoDetectRef.current = false;
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 24 * 60 * 60 * 1000,
      }
    );
  }, [applyPhonePrefix, autocompleteService, initialData?.country, initialData?.phone, phonePrefix]);

  const applyCountryFields = useCallback((fields: CountryFields, addressValue?: string) => {
    if (addressValue) {
      setValue('address', addressValue, { shouldValidate: true });
    }
    setValue('city', fields.city, { shouldValidate: true });
    setValue('zipCode', fields.zipCode, { shouldValidate: true });
    setValue('province', fields.province, { shouldValidate: true });
    setValue('country', fields.country, { shouldValidate: true });

    if (fields.countryCode) {
      applyPhonePrefix(fields.countryCode);
    } else {
      applyPhonePrefix(getCountryByName(fields.country)?.code ?? null);
    }
  }, [applyPhonePrefix, setValue]);

  const handleAddressSelect = (suggestion: PlaceSuggestion) => {
    setValue('address', suggestion.description, { shouldValidate: true });

    if (!window.google?.maps?.Geocoder) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ placeId: suggestion.place_id }, (results, status) => {
      if (status === 'OK' && results && results.length > 0) {
        applyCountryFields(parseCountryFields(results[0].address_components));
      }
    });
  };

  const handleUseCurrentLocation = useCallback(async () => {
    setLocationFeedback(null);
    setIsLocating(true);

    try {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        throw new Error("La géolocalisation n'est pas disponible sur cet appareil.");
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        });
      });

      if (!window.google?.maps?.Geocoder) {
        throw new Error('Google Maps est indisponible pour convertir votre position en adresse.');
      }

      const geocoder = new window.google.maps.Geocoder();
      const result = await new Promise<google.maps.GeocoderResult>((resolve, reject) => {
        geocoder.geocode(
          { location: { lat: position.coords.latitude, lng: position.coords.longitude } },
          (results, status) => {
            if (status === 'OK' && results && results.length > 0) {
              resolve(results[0]);
              return;
            }
            reject(new Error("Impossible de convertir votre position en adresse."));
          }
        );
      });

      applyCountryFields(
        parseCountryFields(result.address_components),
        result.formatted_address || result.address_components.map((component) => component.long_name).join(', ')
      );
      setLocationFeedback({ type: 'success', message: 'Position détectée et adresse remplie automatiquement.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Impossible d'obtenir votre position.";
      setLocationFeedback({ type: 'error', message });
      showError(message);
    } finally {
      setIsLocating(false);
    }
  }, [applyCountryFields, showError]);

  const phoneCountry = getCountryByDialCode(phonePrefix);
  const phonePlaceholder = phoneCountry
    ? `${phonePrefix} ${phoneCountry.defaultNumber}`
    : '+XXX XXXXXXXX';
  const phoneHelperText = phoneCountry
    ? `Format international requis, ex. ${phonePrefix} ${phoneCountry.defaultNumber}`
    : 'Format international requis, ex. +237 655 744 484';

  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  const parsedInitial = initialData?.dob ? initialData.dob.split('-') : ['', '', ''];
  const [dayVal, setDayVal] = useState(parsedInitial[2] || '');
  const [monthVal, setMonthVal] = useState(parsedInitial[1] || '');
  const [yearVal, setYearVal] = useState(parsedInitial[0] || '');

  const assembleDob = useCallback((day: string, month: string, year: string) => {
    if (year.length === 4 && month.length === 2 && day.length === 2) {
      setValue('dob', `${year}-${month}-${day}`, { shouldValidate: true });
    } else {
      setValue('dob', '', { shouldValidate: false });
    }
  }, [setValue]);

  const handleDobFieldChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'day' | 'month' | 'year',
    maxLen: number,
    nextRef: React.RefObject<HTMLInputElement | null>,
  ) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, maxLen);
    e.target.value = raw;

    if (field === 'day') setDayVal(raw);
    else if (field === 'month') setMonthVal(raw);
    else setYearVal(raw);

    const d = field === 'day' ? raw : dayVal;
    const m = field === 'month' ? raw : monthVal;
    const y = field === 'year' ? raw : yearVal;
    assembleDob(d, m, y);

    if (raw.length === maxLen && nextRef.current) {
      nextRef.current.focus();
    }
  };

  const handleDobKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    prevRef: React.RefObject<HTMLInputElement | null>,
  ) => {
    if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '' && prevRef.current) {
      prevRef.current.focus();
    }
  };

  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(initialPhoto || null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPhoto && !photoDataUrl) {
      const url = URL.createObjectURL(initialPhoto);
      setPhotoDataUrl(url);
    }
  }, [initialPhoto, photoDataUrl]);

  const photoDataUrlRef = useRef<string | null>(null);
  useEffect(() => {
    photoDataUrlRef.current = photoDataUrl;
  }, [photoDataUrl]);

  useEffect(() => {
    return () => {
      if (photoDataUrlRef.current && photoDataUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(photoDataUrlRef.current);
      }
    };
  }, []);

  const takePhoto = async () => {
    setPhotoError(null);

    if (Capacitor.isNativePlatform()) {
      try {
        const image = await CapacitorCamera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Camera,
        });

        if (image.dataUrl) {
          setPhotoDataUrl(image.dataUrl);
          const res = await fetch(image.dataUrl);
          const blob = await res.blob();
          const file = new File([blob], 'biophoto.jpeg', { type: 'image/jpeg' });
          setPhotoFile(file);
        }
      } catch (error: unknown) {
        console.error('Erreur lors de la prise de photo:', error);
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('User cancelled') || msg.includes('cancelled')) {
          return;
        } else if (msg.includes('permission')) {
          setPhotoError("Permission caméra refusée. Veuillez l'autoriser dans les paramètres.");
        } else {
          setPhotoError('Impossible de prendre la photo. Veuillez réessayer.');
        }
      }
    } else {
      const input = document.getElementById('web-camera-fallback') as HTMLInputElement;
      if (input) input.click();
    }
  };

  const handleWebPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('Seules les images sont acceptées.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError('Image trop lourde (Max 10Mo).');
      return;
    }

    setPhotoError(null);

    setPhotoDataUrl(prev => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });

    const url = URL.createObjectURL(file);
    setPhotoDataUrl(url);
    setPhotoFile(file);
  };

  const onSubmit = (data: Step2FormData) => {
    if (!photoFile) {
      showError('La photo biométrique est obligatoire pour finaliser votre inscription.');
      return;
    }
    onNext(data, photoFile);
  };

  const handleNameInput = (e: React.FormEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    target.value = target.value.replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const phoneField = register('phone');
  const handlePhoneInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    phoneTouchedRef.current = true;
    const detectedPrefix = getDialCodeFromPhone(event.target.value) ?? '';
    phonePrefixRef.current = detectedPrefix;
    setPhonePrefix(detectedPrefix);
    phoneField.onChange(event);
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white">Votre Profil Chauffeur</h2>
        <p className="text-[#9CA3AF] mt-2">Ces informations sont requises pour votre vérification légale.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" data-driver-onboarding-form>
        <div className={driverSectionCardClassName}>
          <h3 className={driverSectionTitleClassName}>Identité</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField
              {...register('firstName')}
              label="Prénom"
              labelClassName="text-slate-100"
              className={driverInputClassName}
              onInput={handleNameInput}
              error={errors.firstName?.message}
              required
            />
            <InputField
              {...register('lastName')}
              label="Nom"
              labelClassName="text-slate-100"
              className={driverInputClassName}
              onInput={handleNameInput}
              error={errors.lastName?.message}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="w-full">
              <label className="block text-sm font-medium text-slate-100 mb-2">
                Date de naissance<span className="text-red-500 ml-1">*</span>
              </label>
              <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.35fr)] items-center gap-1.5 sm:gap-2">
                <input
                  ref={dayRef}
                  name="dobDay"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="JJ"
                  value={dayVal}
                  onChange={(e) => handleDobFieldChange(e, 'day', 2, monthRef)}
                  onKeyDown={(e) => handleDobKeyDown(e, dayRef)}
                  aria-label="Jour de naissance"
                  className={dobInputClassName}
                />
                <span className="text-[#4B5563] text-lg font-medium select-none">/</span>
                <input
                  ref={monthRef}
                  name="dobMonth"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="MM"
                  value={monthVal}
                  onChange={(e) => handleDobFieldChange(e, 'month', 2, yearRef)}
                  onKeyDown={(e) => handleDobKeyDown(e, dayRef)}
                  aria-label="Mois de naissance"
                  className={dobInputClassName}
                />
                <span className="text-[#4B5563] text-lg font-medium select-none">/</span>
                <input
                  ref={yearRef}
                  name="dobYear"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="AAAA"
                  value={yearVal}
                  onChange={(e) => handleDobFieldChange(e, 'year', 4, { current: null })}
                  onKeyDown={(e) => handleDobKeyDown(e, monthRef)}
                  aria-label="Année de naissance"
                  className={dobInputClassName}
                />
              </div>
              <p className="mt-1 text-sm text-slate-300">Format : JJ / MM / AAAA</p>
              {errors.dob?.message && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {errors.dob.message}
                </p>
              )}
              <input type="hidden" {...register('dob')} />
            </div>
            <InputField
              type="tel"
              label="Numéro de Téléphone"
              labelClassName="text-slate-100"
              className={driverInputClassName}
              placeholder={phonePlaceholder}
              {...phoneField}
              onChange={handlePhoneInput}
              helperText={phoneHelperText}
              required
            />
          </div>

          <div className="w-full">
            <AddressInput
              label="Adresse de résidence"
              value={addressVal}
              onChange={(val) => {
                setValue('address', val, { shouldValidate: true });
                if (val === '') {
                  setValue('city', '');
                  setValue('zipCode', '');
                  setValue('province', '');
                  setValue('country', '');
                  applyPhonePrefix(null);
                }
              }}
              onSelect={handleAddressSelect}
              autocompleteService={autocompleteService}
              placeholder="Saisissez votre adresse de résidence"
              required
              error={errors.address?.message}
            />
            <div className="mt-3">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MaterialIcon name="my_location" size="sm" />}
                Utiliser ma position
              </button>
              {locationFeedback?.type === 'error' && (
                <p className={`mt-2 text-sm ${locationFeedback.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {locationFeedback.message}
                </p>
              )}
            </div>
          </div>

          {watch('city') && (
            <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-[#242424]/50 border border-white/[0.05] text-sm text-slate-400">
              <div>
                <span className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">Ville</span>
                <span className="text-white font-medium">{watch('city')}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">Code Postal</span>
                <span className="text-white font-medium">{watch('zipCode') || 'Non détecté'}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">Province / Région</span>
                <span className="text-white font-medium">{watch('province')}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">Pays</span>
                <span className="text-white font-medium">{watch('country')}</span>
              </div>
            </div>
          )}

          <input type="hidden" {...register('city')} />
          <input type="hidden" {...register('zipCode')} />
          <input type="hidden" {...register('province')} />
          <input type="hidden" {...register('country')} />
        </div>

        <div className={driverSectionCardClassName}>
          <h3 className={driverSectionTitleClassName}>Photo de profil</h3>
          <p className="text-sm text-[#9CA3AF]">Prenez un selfie sur le vif. Assurez-vous d'être bien éclairé et de cadrer votre visage et cou dans l'ovale virtuel.</p>

          <input
            id="web-camera-fallback"
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={handleWebPhotoChange}
          />

          <div className="flex flex-col items-center justify-center py-4">
            {photoDataUrl ? (
              <div className="relative w-48 h-48 rounded-full overflow-hidden border-4 border-[#f29200]">
                <img src={photoDataUrl} alt="Biometric" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-48 h-48 rounded-full bg-[#242424] flex items-center justify-center border-4 border-dashed border-white/20">
                <Camera className="w-12 h-12 text-[#4B5563]" />
              </div>
            )}
            <button
              type="button"
              onClick={takePhoto}
              className="mt-4 px-6 py-2 bg-[#242424] text-white font-medium rounded-full hover:bg-white/10 transition-colors"
            >
              {photoDataUrl ? 'Reprendre la photo' : 'Ouvrir la caméra'}
            </button>

            {photoError && (
              <div className="mt-3 p-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg">
                <p className="text-[#EF4444] text-sm text-center">{photoError}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={onBack}
            className={cn(driverSecondaryButtonClassName, 'w-1/3')}
          >
            Retour
          </button>
          <button
            type="submit"
            disabled={loading}
            className={cn(driverPrimaryButtonClassName, 'w-2/3')}
          >
            {loading ? <Loader2 className="animate-spin mr-2" /> : null}
            Continuer
          </button>
        </div>
      </form>
    </div>
  );
}
