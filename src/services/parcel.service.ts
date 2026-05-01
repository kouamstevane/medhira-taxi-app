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
import { ACTIVE_MARKET, CURRENCY_CODE } from '@/utils/constants';
import { getDeliveryDistance } from '@/utils/distance';
import { logger } from '@/utils/logger';
import { z } from 'zod';
import { FIRESTORE_COLLECTIONS } from '@/types/firestore-collections';

/** Pays autorisés pour l'envoi de colis (urbain + national uniquement). */
export const ALLOWED_PARCEL_COUNTRIES = ['CM', 'CA'] as const;
export type AllowedParcelCountry = typeof ALLOWED_PARCEL_COUNTRIES[number];

/** Distance maximum entre le retrait et la livraison (km). National uniquement. */
export const MAX_PARCEL_DISTANCE_KM = 800;

export interface ParcelLocation {
  address: string;
  latitude: number;
  longitude: number;
  /** ISO 3166-1 alpha-2. Renseigné via Google Geocoder côté UI. */
  country: string;
}

export type ParcelSizeCategory = 'small' | 'medium' | 'large';

export const PARCEL_SIZE_LABELS: Record<ParcelSizeCategory, { label: string; description: string; weightMax: number }> = {
  small: { label: 'Petit', description: '< 5 kg · Sac, enveloppe', weightMax: 5 },
  medium: { label: 'Moyen', description: '5-15 kg · Boîte, carton', weightMax: 15 },
  large: { label: 'Grand', description: '15-30 kg · Colis volumineux', weightMax: 30 },
};

/**
 * Tarification colis par marché.
 * Indépendante du tarif food : un colis a une logistique différente
 * (poids, manutention, prise en charge dédiée).
 */
interface ParcelPricingConfig {
  basePrice: number;
  pricePerKm: number;
  /** Multiplicateur appliqué selon la taille. */
  sizeMultiplier: Record<ParcelSizeCategory, number>;
}

const PARCEL_PRICING: Record<AllowedParcelCountry, ParcelPricingConfig> = {
  CM: {
    basePrice: 1500,        // 1 500 FCFA prise en charge
    pricePerKm: 200,        // 200 FCFA/km
    sizeMultiplier: { small: 1.0, medium: 1.4, large: 1.8 },
  },
  CA: {
    basePrice: 5,           // 5 CAD prise en charge
    pricePerKm: 1.25,       // 1.25 CAD/km
    sizeMultiplier: { small: 1.0, medium: 1.4, large: 1.8 },
  },
};

/** Map pays → devise utilisée pour le colis (cohérent avec le marché). */
const COUNTRY_CURRENCY: Record<AllowedParcelCountry, string> = {
  CM: 'FCFA',
  CA: 'CAD',
};

const LocationSchema = z.object({
  address: z.string().min(5, "L'adresse est requise"),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().refine(
    (c) => (ALLOWED_PARCEL_COUNTRIES as readonly string[]).includes(c),
    { message: 'Service disponible uniquement au Cameroun et au Canada' },
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

/**
 * Valide qu'une adresse est dans un pays desservi.
 * À utiliser dès la sélection d'adresse pour feedback immédiat.
 */
export const isCountrySupported = (country: string): country is AllowedParcelCountry => {
  return (ALLOWED_PARCEL_COUNTRIES as readonly string[]).includes(country);
};

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
  if (!isCountrySupported(pickup.country)) {
    throw new ParcelValidationError(
      `Le retrait doit être au Cameroun ou au Canada (pays détecté : ${pickup.country || 'inconnu'})`,
      'pickup'
    );
  }
  if (!isCountrySupported(dropoff.country)) {
    throw new ParcelValidationError(
      `La livraison doit être au Cameroun ou au Canada (pays détecté : ${dropoff.country || 'inconnu'})`,
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

  const config = PARCEL_PRICING[pickup.country];
  const baseDelivery = distanceKm * config.pricePerKm;
  const multiplier = config.sizeMultiplier[sizeCategory];
  const rawPrice = (config.basePrice + baseDelivery) * multiplier;
  const price = pickup.country === 'CM'
    ? Math.round(rawPrice / 50) * 50  // Arrondi au 50 FCFA
    : Math.round(rawPrice * 100) / 100; // 2 décimales CAD

  return {
    price,
    distance: distanceKm,
    duration: durationMinutes,
    currency: COUNTRY_CURRENCY[pickup.country],
  };
};

/**
 * Cherche un utilisateur existant par numéro de téléphone (E.164 strict).
 * Retourne l'UID si trouvé, sinon null (destinataire invité).
 */
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

  // Lookup destinataire : si compte existe, on lie ; sinon invité (SMS uniquement)
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
