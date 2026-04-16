'use client';

import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { typedServerTimestamp } from '@/lib/firebase-helpers';
import { CURRENCY_CODE, DEFAULT_PRICING, FOOD_DELIVERY_PRICING } from '@/utils/constants';
import { getDeliveryDistance } from '@/utils/distance';
import { logger } from '@/utils/logger';
import { z } from 'zod';
import { FIRESTORE_COLLECTIONS } from '@/types/firestore-collections';

export interface ParcelLocation {
  address: string;
  latitude: number;
  longitude: number;
}

export type ParcelSizeCategory = 'small' | 'medium' | 'large';

export const PARCEL_SIZE_LABELS: Record<ParcelSizeCategory, { label: string; description: string; weightMax: number }> = {
  small: { label: 'Petit', description: '< 5 kg · Sac, enveloppe', weightMax: 5 },
  medium: { label: 'Moyen', description: '5-15 kg · Boîte, carton', weightMax: 15 },
  large: { label: 'Grand', description: '15-30 kg · Colis volumineux', weightMax: 30 },
};

const CreateParcelSchema = z.object({
  senderId: z.string().min(1),
  recipientName: z.string().min(2, 'Le nom du destinataire est requis'),
  recipientPhone: z.string().min(8, 'Numéro de téléphone invalide'),
  pickupLocation: z.object({
    address: z.string().min(5, "L'adresse de retrait est requise"),
    latitude: z.number(),
    longitude: z.number(),
  }),
  dropoffLocation: z.object({
    address: z.string().min(5, "L'adresse de livraison est requise"),
    latitude: z.number(),
    longitude: z.number(),
  }),
  description: z.string().min(3, 'Décrivez brièvement le colis').max(200),
  weight: z.number().min(0.1).max(30),
  sizeCategory: z.enum(['small', 'medium', 'large']),
  pickupInstructions: z.string().max(200).optional(),
});

export type CreateParcelInput = z.infer<typeof CreateParcelSchema>;

export const estimateParcelPrice = async (
  pickup: ParcelLocation,
  dropoff: ParcelLocation,
  sizeCategory: ParcelSizeCategory
): Promise<{ price: number; distance: number; duration: number; currency: string }> => {
  const { distanceKm, durationMinutes } = await getDeliveryDistance(
    { lat: pickup.latitude, lng: pickup.longitude },
    { lat: dropoff.latitude, lng: dropoff.longitude }
  );

  const baseDelivery = distanceKm * FOOD_DELIVERY_PRICING.RATE_PER_KM;
  const sizeMultiplier = sizeCategory === 'small' ? 1 : sizeCategory === 'medium' ? 1.3 : 1.6;
  const price = Math.round((DEFAULT_PRICING.BASE_PRICE + baseDelivery) * sizeMultiplier * 100) / 100;

  return {
    price,
    distance: distanceKm,
    duration: durationMinutes,
    currency: CURRENCY_CODE,
  };
};

export const createParcelOrder = async (data: CreateParcelInput): Promise<string> => {
  const validated = CreateParcelSchema.safeParse(data);
  if (!validated.success) {
    const firstError = validated.error.issues[0];
    throw new Error(firstError.message);
  }

  const priceEstimate = await estimateParcelPrice(
    data.pickupLocation,
    data.dropoffLocation,
    data.sizeCategory
  );

  const parcelsRef = collection(db, FIRESTORE_COLLECTIONS.PARCELS);
  const newParcelRef = doc(parcelsRef);

  const parcel = {
    parcelId: newParcelRef.id,
    senderId: data.senderId,
    receiverId: '',
    driverId: null,
    status: 'pending' as const,
    pickupLocation: data.pickupLocation,
    dropoffLocation: data.dropoffLocation,
    description: data.description,
    weight: data.weight,
    sizeCategory: data.sizeCategory,
    pickupInstructions: data.pickupInstructions || '',
    recipientName: data.recipientName,
    recipientPhone: data.recipientPhone,
    estimatedPrice: priceEstimate.price,
    finalPrice: null,
    price: priceEstimate.price,
    currency: CURRENCY_CODE,
    createdAt: typedServerTimestamp(),
    updatedAt: typedServerTimestamp(),
  };

  await setDoc(newParcelRef, parcel);

  logger.info('Colis créé avec succès', {
    parcelId: newParcelRef.id,
    price: priceEstimate.price,
    distance: priceEstimate.distance,
  });

  return newParcelRef.id;
};
