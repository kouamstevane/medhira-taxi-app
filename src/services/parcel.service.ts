'use client';

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import {
  getMarketByCountryCode,
  getSupportedCountryNames,
  applyRounding,
} from '@/utils/constants';
import { getDeliveryDistance } from '@/utils/distance';
import { z } from 'zod';
import { translate } from '@/locales';

export const MAX_PARCEL_DISTANCE_KM = 800;

export interface ParcelLocation {
  address: string;
  latitude: number;
  longitude: number;
  country: string;
}

export type ParcelType = 'food' | 'medicine' | 'document' | 'flowers' | 'other';

export const PARCEL_TYPE_LABELS: Record<ParcelType, { label: string; icon: string }> = {
  food: { label: 'Nourriture', icon: 'restaurant' },
  medicine: { label: 'Médicament', icon: 'medical_services' },
  document: { label: 'Document', icon: 'description' },
  flowers: { label: 'Fleurs', icon: 'local_florist' },
  other: { label: 'Autres', icon: 'inventory_2' },
};

const LocationSchema = z.object({
  address: z.string().min(5, { error: () => translate('serviceMessages.parcel.addressRequired') }),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().refine(
    (c) => getMarketByCountryCode(c) !== null,
    { error: () => translate('serviceMessages.parcel.unsupportedCountry') }
  ),
});

const CreateParcelSchema = z.object({
  senderId: z.string().min(1),
  recipientName: z.string().min(2, { error: () => translate('serviceMessages.parcel.recipientNameRequired') }),
  recipientPhone: z.string().min(8, { error: () => translate('serviceMessages.parcel.invalidRecipientPhone') }),
  pickupLocation: LocationSchema,
  dropoffLocation: LocationSchema,
  parcelType: z.enum(['food', 'medicine', 'document', 'flowers', 'other']),
  customType: z.string().max(100).optional(),
  description: z.string().max(200).optional(),
  weight: z.number().min(0.1).max(30).optional(),
  pickupInstructions: z.string().max(200).optional(),
  paymentMethod: z.enum(['wallet', 'card']).default('wallet'),
}).refine(
  (data) => data.pickupLocation.country === data.dropoffLocation.country,
  { error: () => translate('serviceMessages.parcel.sameCountryOnly'), path: ['dropoffLocation'] }
);

export type CreateParcelInput = z.infer<typeof CreateParcelSchema>;

export interface ParcelOrderResult {
  parcelId: string;
  amount: number;
  currency: string;
  paymentMethod: 'wallet' | 'card';
  clientSecret?: string;
  paymentIntentId?: string;
}

export class ParcelValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ParcelValidationError';
  }
}

export interface PriceEstimate {
  price: number;
  distance: number;
  duration: number;
  currency: string;
}

export const estimateParcelPrice = async (
  pickup: ParcelLocation,
  dropoff: ParcelLocation
): Promise<PriceEstimate> => {
  const pickupMarket = getMarketByCountryCode(pickup.country);
  if (!pickupMarket) {
    throw new ParcelValidationError(
      translate('serviceMessages.parcel.pickupCountryUnsupported', {
        countries: getSupportedCountryNames(),
        detected: pickup.country || translate('serviceMessages.parcel.unknownCountry'),
      }),
      'pickup'
    );
  }
  if (!getMarketByCountryCode(dropoff.country)) {
    throw new ParcelValidationError(
      translate('serviceMessages.parcel.dropoffCountryUnsupported', {
        countries: getSupportedCountryNames(),
        detected: dropoff.country || translate('serviceMessages.parcel.unknownCountry'),
      }),
      'dropoff'
    );
  }
  if (pickup.country !== dropoff.country) {
    throw new ParcelValidationError(
      translate('serviceMessages.parcel.internationalUnsupported'),
      'dropoff'
    );
  }

  const { distanceKm, durationMinutes } = await getDeliveryDistance(
    { lat: pickup.latitude, lng: pickup.longitude },
    { lat: dropoff.latitude, lng: dropoff.longitude }
  );

  if (distanceKm > MAX_PARCEL_DISTANCE_KM) {
    throw new ParcelValidationError(
      translate('serviceMessages.parcel.distanceTooHigh', { distance: distanceKm.toFixed(0), max: MAX_PARCEL_DISTANCE_KM }),
      'dropoff'
    );
  }

  const pricing = pickupMarket.config.parcelPricing;
  const baseDelivery = distanceKm * pricing.pricePerKm;
  const rawPrice = pricing.basePrice + baseDelivery;
  const price = applyRounding(rawPrice, pricing.roundingStrategy);

  return {
    price,
    distance: distanceKm,
    duration: durationMinutes,
    currency: pickupMarket.config.currencyCode,
  };
};

export const createParcelOrder = async (data: CreateParcelInput): Promise<ParcelOrderResult> => {
  const validated = CreateParcelSchema.safeParse(data);
  if (!validated.success) {
    const firstError = validated.error.issues[0];
    throw new ParcelValidationError(firstError.message, firstError.path[0]?.toString());
  }

  const createFn = httpsCallable<Omit<CreateParcelInput, 'senderId'>, ParcelOrderResult>(
    functions,
    'createParcelOrder',
  );
  const { senderId: _senderId, ...requestData } = data;
  const request = Object.fromEntries(
    Object.entries(requestData).filter(([, value]) => value !== undefined),
  ) as Omit<CreateParcelInput, 'senderId'>;
  const result = await createFn(request);
  return result.data;
};

export const finalizeParcelCardPayment = async (
  parcelId: string,
  paymentIntentId: string,
): Promise<void> => {
  const finalizeFn = httpsCallable<
    { parcelId: string; paymentIntentId: string },
    { success: boolean }
  >(functions, 'finalizeParcelCardPayment');
  await finalizeFn({ parcelId, paymentIntentId });
};

export const confirmParcelReceipt = async (parcelId: string): Promise<void> => {
  const confirmFn = httpsCallable<{ parcelId: string }, { success: boolean }>(
    functions,
    'confirmParcelReceipt'
  );
  await confirmFn({ parcelId });
};
