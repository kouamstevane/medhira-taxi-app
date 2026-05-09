'use client';

import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { typedServerTimestamp } from '@/lib/firebase-helpers';
import {
  getMarketByCountryCode,
  getSupportedCountryNames,
  applyRounding,
} from '@/utils/constants';
import { getDeliveryDistance } from '@/utils/distance';
import { logger } from '@/utils/logger';
import { z } from 'zod';
import { FIRESTORE_COLLECTIONS } from '@/types/firestore-collections';

export const MAX_PARCEL_DISTANCE_KM = 800;

export interface ParcelLocation {
  address: string;
  latitude: number;
  longitude: number;
  country: string;
}

export type ParcelSizeCategory = 'small' | 'medium' | 'large';

export const PARCEL_SIZE_LABELS: Record<ParcelSizeCategory, { label: string; description: string; weightMax: number }> = {
  small: { label: 'Petit', description: '< 5 kg · Sac, enveloppe', weightMax: 5 },
  medium: { label: 'Moyen', description: '5-15 kg · Boîte, carton', weightMax: 15 },
  large: { label: 'Grand', description: '15-30 kg · Colis volumineux', weightMax: 30 },
};

const LocationSchema = z.object({
  address: z.string().min(5, "L'adresse est requise"),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().refine(
    (c) => getMarketByCountryCode(c) !== null,
    { message: `Service disponible uniquement dans les pays supportés` }
  ),
});

const CreateParcelSchema = z.object({
  senderId: z.string().min(1),
  recipientName: z.string().min(2, 'Le nom du destinataire est requis'),
  recipientPhone: z.string().min(8, 'Numéro de téléphone invalide'),
  pickupLocation: LocationSchema,
  dropoffLocation: LocationSchema,
  description: z.string().min(3, 'Décrivez brièvement le colis').max(200),
  weight: z.number().min(0.1).max(30),
  sizeCategory: z.enum(['small', 'medium', 'large']),
  pickupInstructions: z.string().max(200).optional(),
}).refine(
  (data) => data.pickupLocation.country === data.dropoffLocation.country,
  { message: 'Le retrait et la livraison doivent être dans le même pays (envoi national uniquement)', path: ['dropoffLocation'] }
);

export type CreateParcelInput = z.infer<typeof CreateParcelSchema>;

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
  dropoff: ParcelLocation,
  sizeCategory: ParcelSizeCategory
): Promise<PriceEstimate> => {
  const pickupMarket = getMarketByCountryCode(pickup.country);
  if (!pickupMarket) {
    throw new ParcelValidationError(
      `Le retrait doit être dans un pays supporté (${getSupportedCountryNames()}) (pays détecté : ${pickup.country || 'inconnu'})`,
      'pickup'
    );
  }
  if (!getMarketByCountryCode(dropoff.country)) {
    throw new ParcelValidationError(
      `La livraison doit être dans un pays supporté (${getSupportedCountryNames()}) (pays détecté : ${dropoff.country || 'inconnu'})`,
      'dropoff'
    );
  }
  if (pickup.country !== dropoff.country) {
    throw new ParcelValidationError(
      'Envoi international non supporté — le retrait et la livraison doivent être dans le même pays',
      'dropoff'
    );
  }

  const { distanceKm, durationMinutes } = await getDeliveryDistance(
    { lat: pickup.latitude, lng: pickup.longitude },
    { lat: dropoff.latitude, lng: dropoff.longitude }
  );

  if (distanceKm > MAX_PARCEL_DISTANCE_KM) {
    throw new ParcelValidationError(
      `Distance trop élevée (${distanceKm.toFixed(0)} km). Maximum : ${MAX_PARCEL_DISTANCE_KM} km`,
      'dropoff'
    );
  }

  const pricing = pickupMarket.config.parcelPricing;
  const baseDelivery = distanceKm * pricing.pricePerKm;
  const multiplier = pricing.sizeMultiplier[sizeCategory];
  const rawPrice = (pricing.basePrice + baseDelivery) * multiplier;
  const price = applyRounding(rawPrice, pricing.roundingStrategy);

  return {
    price,
    distance: distanceKm,
    duration: durationMinutes,
    currency: pickupMarket.config.currencyCode,
  };
};

const lookupRecipientByPhone = async (phone: string): Promise<string | null> => {
  const normalized = phone.replace(/\s+/g, '');
  if (normalized.length < 8) return null;
  try {
    const usersRef = collection(db, FIRESTORE_COLLECTIONS.USERS);
    const q = query(usersRef, where('phoneNumber', '==', normalized), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].id;
  } catch (err) {
    logger.warn('Impossible de chercher le destinataire par téléphone', { error: err });
    return null;
  }
};

export const createParcelOrder = async (data: CreateParcelInput): Promise<string> => {
  const validated = CreateParcelSchema.safeParse(data);
  if (!validated.success) {
    const firstError = validated.error.issues[0];
    throw new ParcelValidationError(firstError.message, firstError.path[0]?.toString());
  }

  const priceEstimate = await estimateParcelPrice(
    data.pickupLocation,
    data.dropoffLocation,
    data.sizeCategory
  );

  const receiverId = await lookupRecipientByPhone(data.recipientPhone);
  const recipientIsGuest = receiverId === null;

  const parcelsRef = collection(db, FIRESTORE_COLLECTIONS.PARCELS);
  const newParcelRef = doc(parcelsRef);

  const parcel = {
    parcelId: newParcelRef.id,
    senderId: data.senderId,
    receiverId: receiverId || '',
    recipientName: data.recipientName,
    recipientPhone: data.recipientPhone.replace(/\s+/g, ''),
    recipientIsGuest,
    driverId: null,
    status: 'pending' as const,
    pickupLocation: data.pickupLocation,
    dropoffLocation: data.dropoffLocation,
    description: data.description,
    weight: data.weight,
    sizeCategory: data.sizeCategory,
    pickupInstructions: data.pickupInstructions || '',
    estimatedPrice: priceEstimate.price,
    finalPrice: null,
    price: priceEstimate.price,
    currency: priceEstimate.currency,
    distanceKm: priceEstimate.distance,
    durationMinutes: priceEstimate.duration,
    createdAt: typedServerTimestamp(),
    updatedAt: typedServerTimestamp(),
  };

  await setDoc(newParcelRef, parcel);

  logger.info('Colis créé', {
    parcelId: newParcelRef.id,
    price: priceEstimate.price,
    distance: priceEstimate.distance,
    country: data.pickupLocation.country,
    recipientHasAccount: !recipientIsGuest,
  });

  return newParcelRef.id;
};
