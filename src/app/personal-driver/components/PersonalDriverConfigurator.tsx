'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddressInput } from '@/app/taxi/components/AddressInput';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import {
  DISTANCE_ESTIMATE_ERROR_MESSAGE,
  estimateRoadDistanceKm,
} from '@/services/personal-driver/distance.service';
import type {
  PersonalDriverPlan,
  PersonalDriverTripType,
  PersonalDriverWeekday,
} from '@/types/personal-driver';
import { WeekdaySelector } from './WeekdaySelector';

export const PERSONAL_DRIVER_CONFIG_SESSION_KEY = 'medjira.personalDriver.config.v1';

export interface PersonalDriverConfiguration {
  version: 1;
  requestId: string;
  planId: PersonalDriverPlan['id'];
  pickupAddress: string;
  destinationAddress: string;
  tripType: PersonalDriverTripType;
  weekdays: PersonalDriverWeekday[];
  departureTime: string;
  returnTime?: string;
  startDate: string;
  passengerCount: number;
  notes?: string;
  distanceKm: number;
  distanceOneWayKm: number;
  distanceReturnKm?: number;
  monthlyDistanceKm: number;
}

interface PersonalDriverConfiguratorProps {
  plan: PersonalDriverPlan;
}

interface FormErrors {
  pickupAddress?: string;
  destinationAddress?: string;
  weekdays?: string;
  departureTime?: string;
  returnTime?: string;
  startDate?: string;
  distance?: string;
}

interface AccessibleAddressInputProps {
  error?: string;
  errorId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: Parameters<NonNullable<React.ComponentProps<typeof AddressInput>['onSelect']>>[0]) => void;
  autocompleteService: google.maps.places.AutocompleteService | null;
  required?: boolean;
}

function AccessibleAddressInput({ error, errorId, ...props }: AccessibleAddressInputProps) {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const input = fieldRef.current?.querySelector('input');
    const errorNode = fieldRef.current?.querySelector('p');

    if (input) {
      input.setAttribute('aria-invalid', String(Boolean(error)));
      if (error) {
        input.setAttribute('aria-describedby', errorId);
      } else {
        input.removeAttribute('aria-describedby');
      }
    }

    if (errorNode) {
      if (error) {
        errorNode.id = errorId;
        errorNode.setAttribute('role', 'alert');
      } else {
        errorNode.removeAttribute('id');
        errorNode.removeAttribute('role');
      }
    }
  }, [error, errorId]);

  return (
    <div ref={fieldRef}>
      <AddressInput {...props} error={error} />
    </div>
  );
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `personal-driver-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getSessionRequestId(): string {
  if (typeof window === 'undefined') {
    return createRequestId();
  }

  try {
    const stored = sessionStorage.getItem(PERSONAL_DRIVER_CONFIG_SESSION_KEY);
    const configuration = stored ? JSON.parse(stored) : null;

    if (typeof configuration?.requestId === 'string' && configuration.requestId) {
      return configuration.requestId;
    }
  } catch {
    sessionStorage.removeItem(PERSONAL_DRIVER_CONFIG_SESSION_KEY);
  }

  return createRequestId();
}

export function PersonalDriverConfigurator({ plan }: PersonalDriverConfiguratorProps) {
  const router = useRouter();
  const { autocompleteService } = useGoogleMaps();
  const requestIdRef = useRef<string | null>(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [tripType, setTripType] = useState<PersonalDriverTripType>('one_way');
  const [weekdays, setWeekdays] = useState<PersonalDriverWeekday[]>([]);
  const [departureTime, setDepartureTime] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [startDate, setStartDate] = useState('');
  const [passengerCount, setPassengerCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [distanceError, setDistanceError] = useState('');
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  if (!requestIdRef.current) {
    requestIdRef.current = getSessionRequestId();
  }

  const calculateDistance = async () => {
    setDistanceError('');
    setDistanceKm(null);

    if (!pickupAddress.trim() || !destinationAddress.trim()) {
      setDistanceError(DISTANCE_ESTIMATE_ERROR_MESSAGE);
      return;
    }

    setIsCalculatingDistance(true);
    try {
      const estimatedDistance = await estimateRoadDistanceKm(pickupAddress, destinationAddress);
      if (estimatedDistance <= 0) {
        throw new Error('Distance must be positive');
      }
      setDistanceKm(estimatedDistance);
      setErrors((currentErrors) => {
        if (!currentErrors.distance) return currentErrors;
        const { distance: _distance, ...remainingErrors } = currentErrors;
        return remainingErrors;
      });
    } catch {
      setDistanceError(DISTANCE_ESTIMATE_ERROR_MESSAGE);
    } finally {
      setIsCalculatingDistance(false);
    }
  };

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};

    if (!pickupAddress.trim()) nextErrors.pickupAddress = "L'adresse de depart est requise.";
    if (!destinationAddress.trim()) nextErrors.destinationAddress = 'La destination est requise.';
    if (weekdays.length === 0) nextErrors.weekdays = 'Choisissez au moins un jour.';
    if (!departureTime) nextErrors.departureTime = "L'heure de depart est requise.";
    if (tripType === 'round_trip' && !returnTime) {
      nextErrors.returnTime = "L'heure de retour est requise pour un aller-retour.";
    }
    if (!startDate) nextErrors.startDate = 'La date de debut est requise.';
    if (!distanceKm || distanceKm <= 0) {
      nextErrors.distance = 'Calculez une distance positive avant de continuer.';
    }

    return nextErrors;
  };

  const continueToEstimate = () => {
    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || !distanceKm) {
      return;
    }

    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const startObj = new Date(startYear, startMonth - 1, startDay);
    const selectedWeekdaysSet = new Set(weekdays);
    let totalMatchingDays = 0;
    for (let offset = 0; offset < 30; offset += 1) {
      const currentDate = new Date(startObj);
      currentDate.setDate(startObj.getDate() + offset);
      if (selectedWeekdaysSet.has(currentDate.getDay() as PersonalDriverWeekday)) {
        totalMatchingDays += 1;
      }
    }

    const configuration: PersonalDriverConfiguration = {
      version: 1,
      requestId: requestIdRef.current ?? createRequestId(),
      planId: plan.id,
      pickupAddress: pickupAddress.trim(),
      destinationAddress: destinationAddress.trim(),
      tripType,
      weekdays,
      departureTime,
      ...(tripType === 'round_trip' ? { returnTime } : {}),
      startDate,
      passengerCount,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      distanceKm,
      distanceOneWayKm: distanceKm,
      ...(tripType === 'round_trip' ? { distanceReturnKm: distanceKm } : {}),
      monthlyDistanceKm: distanceKm * (tripType === 'round_trip' ? 2 : 1) * totalMatchingDays,
    };

    sessionStorage.setItem(PERSONAL_DRIVER_CONFIG_SESSION_KEY, JSON.stringify(configuration));
    router.push('/personal-driver/estimation');
  };

  const fieldClassName = 'min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-primary focus:ring-1 focus:ring-primary';
  const fieldErrorClassName = 'mt-1 text-sm text-red-400';

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        continueToEstimate();
      }}
    >
      <section className="space-y-4" aria-label="Itineraire">
        <AccessibleAddressInput
          label="Adresse de depart"
          value={pickupAddress}
          onChange={(value) => {
            setPickupAddress(value);
            setDistanceKm(null);
          }}
          onSelect={(suggestion) => setPickupAddress(suggestion.description)}
          autocompleteService={autocompleteService}
          error={errors.pickupAddress}
          errorId="pickup-address-error"
          required
        />
        <AccessibleAddressInput
          label="Destination"
          value={destinationAddress}
          onChange={(value) => {
            setDestinationAddress(value);
            setDistanceKm(null);
          }}
          onSelect={(suggestion) => setDestinationAddress(suggestion.description)}
          autocompleteService={autocompleteService}
          error={errors.destinationAddress}
          errorId="destination-address-error"
          required
        />
        <button
          type="button"
          onClick={calculateDistance}
          disabled={isCalculatingDistance}
          className="min-h-11 rounded-lg border border-primary/50 px-4 text-sm font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-wait disabled:opacity-60"
        >
          {isCalculatingDistance ? 'Calcul en cours...' : 'Calculer la distance'}
        </button>
        {distanceKm !== null && !distanceError && (
          <p className="text-sm font-semibold text-emerald-400">{distanceKm.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km</p>
        )}
        {distanceError && <p role="alert" className={fieldErrorClassName}>{distanceError}</p>}
        {errors.distance && <p id="distance-error" role="alert" className={fieldErrorClassName}>{errors.distance}</p>}
      </section>

      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-3 text-sm font-semibold text-white">Type de trajet</legend>
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-200">
          <input
            type="radio"
            name="tripType"
            checked={tripType === 'one_way'}
            onChange={() => setTripType('one_way')}
            className="accent-primary"
          />
          Aller simple
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-200">
          <input
            type="radio"
            name="tripType"
            checked={tripType === 'round_trip'}
            onChange={() => setTripType('round_trip')}
            className="accent-primary"
          />
          Aller-retour
        </label>
      </fieldset>

      <div>
        <WeekdaySelector
          allowedWeekdays={plan.allowedWeekdays}
          selectedWeekdays={weekdays}
          onChange={setWeekdays}
          errorId="weekdays-error"
          hasError={Boolean(errors.weekdays)}
        />
        {errors.weekdays && <p id="weekdays-error" role="alert" className={fieldErrorClassName}>{errors.weekdays}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-white">
          Heure de depart
          <input
            type="time"
            value={departureTime}
            onChange={(event) => setDepartureTime(event.target.value)}
            aria-invalid={Boolean(errors.departureTime)}
            aria-describedby={errors.departureTime ? 'departure-time-error' : undefined}
            className={`mt-2 ${fieldClassName}`}
          />
          {errors.departureTime && <span id="departure-time-error" role="alert" className={fieldErrorClassName}>{errors.departureTime}</span>}
        </label>
        {tripType === 'round_trip' && (
          <label className="text-sm font-semibold text-white">
            Heure de retour
            <input
              type="time"
              value={returnTime}
              onChange={(event) => setReturnTime(event.target.value)}
              aria-invalid={Boolean(errors.returnTime)}
              aria-describedby={errors.returnTime ? 'return-time-error' : undefined}
              className={`mt-2 ${fieldClassName}`}
            />
            {errors.returnTime && <span id="return-time-error" role="alert" className={fieldErrorClassName}>{errors.returnTime}</span>}
          </label>
        )}
        <label className="text-sm font-semibold text-white">
          Date de debut
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            aria-invalid={Boolean(errors.startDate)}
            aria-describedby={errors.startDate ? 'start-date-error' : undefined}
            className={`mt-2 ${fieldClassName}`}
          />
          {errors.startDate && <span id="start-date-error" role="alert" className={fieldErrorClassName}>{errors.startDate}</span>}
        </label>
        <label className="text-sm font-semibold text-white">
          Nombre de passagers
          <input
            type="number"
            min="1"
            value={passengerCount}
            onChange={(event) => setPassengerCount(Math.max(1, Number(event.target.value) || 1))}
            className={`mt-2 ${fieldClassName}`}
          />
        </label>
      </div>

      <label className="block text-sm font-semibold text-white">
        Notes pour Medjira
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          className={`mt-2 ${fieldClassName} py-3`}
        />
      </label>

      <button
        type="submit"
        className="min-h-12 w-full rounded-lg bg-primary px-4 text-sm font-bold text-white transition active:scale-[0.98]"
      >
        Continuer vers l estimation
      </button>
    </form>
  );
}
