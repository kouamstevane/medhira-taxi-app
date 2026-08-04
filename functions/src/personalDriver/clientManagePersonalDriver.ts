import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { calculateServerRoute } from './routeDistance.js';
import { isSubscriptionEntitled, markExpiredSubscriptionInTransaction } from './entitlement.js';
import { localDateTimeToUtc, resolveAddressCoordinates } from './locationTimeZone.js';

type PersonalDriverPlanId = 'basic' | 'classic' | 'premium';

const SPECIAL_TRIP_LIMITS: Record<PersonalDriverPlanId, number> = {
  basic: 0,
  classic: 2,
  premium: 4,
};

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function getPlanId(data: FirebaseFirestore.DocumentData): PersonalDriverPlanId | null {
  const planId = data.selectedPlanId ?? data.planId;
  if (planId === 'basic' || planId === 'classic' || planId === 'premium') return planId;
  return null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function roundDistance(value: number): number {
  return Math.round(value * 10) / 10;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

const clientActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('cancelTrip'),
    tripId: z.string().min(1),
  }),
  z.object({
    action: z.literal('requestSpecialTrip'),
    subscriptionId: z.string().min(1),
    pickupAddress: z.string().trim().min(3).max(500),
    destinationAddress: z.string().trim().min(3).max(500),
    scheduledAtIso: z.string().trim().min(10).max(40),
    distanceKm: z.number().finite().positive().max(1000).optional(),
  }),
]);

export const clientManagePersonalDriver = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    const parsed = clientActionSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }

    const db = getDb();
    const uid = request.auth.uid;
    const payload = parsed.data;

    if (payload.action === 'cancelTrip') {
      const tripRef = db.collection('personal_driver_trips').doc(payload.tripId);
      await db.runTransaction(async (transaction) => {
        const tripSnap = await transaction.get(tripRef);
        if (!tripSnap.exists) {
          throw new HttpsError('not-found', 'Trajet introuvable.');
        }
        const trip = tripSnap.data();
        if (trip?.userId !== uid) {
          throw new HttpsError('permission-denied', 'Ce trajet ne vous appartient pas.');
        }
        if (trip.status === 'completed' || trip.status === 'cancelled') {
          throw new HttpsError('failed-precondition', 'Ce trajet ne peut plus être annulé.');
        }

        transaction.update(tripRef, {
          status: 'cancelled',
          cancelledBy: 'client',
          clientCancelledLostKm: true,
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      return { success: true };
    }

    const subscriptionRef = db.collection('personal_driver_subscriptions').doc(payload.subscriptionId);
    const tripRef = db.collection('personal_driver_trips').doc();
    const [authoritativeRoute, pickupLocation] = await Promise.all([
      calculateServerRoute({
        origin: payload.pickupAddress,
        destination: payload.destinationAddress,
      }),
      resolveAddressCoordinates(payload.pickupAddress),
    ]);
    const result = await db.runTransaction(async (transaction) => {
      const subscriptionSnap = await transaction.get(subscriptionRef);
      if (!subscriptionSnap.exists) {
        throw new HttpsError('not-found', 'Abonnement introuvable.');
      }

      const subscription = subscriptionSnap.data();
      if (subscription?.userId !== uid) {
        throw new HttpsError('permission-denied', 'Cet abonnement ne vous appartient pas.');
      }
      const now = new Date();
      if (markExpiredSubscriptionInTransaction(transaction, subscriptionRef, subscription, now)) {
        return { kind: 'expired' as const };
      }
      if (!isSubscriptionEntitled(subscription, now)) {
        throw new HttpsError('failed-precondition', 'Les trajets spéciaux sont disponibles après activation de l’abonnement.');
      }

      const scheduledAtMatch = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(payload.scheduledAtIso);
      if (!scheduledAtMatch || typeof subscription.serviceTimeZone !== 'string') {
        throw new HttpsError('invalid-argument', 'Date ou fuseau du trajet spécial invalide.');
      }
      let scheduledAtUtc: Date;
      try {
        scheduledAtUtc = localDateTimeToUtc(
          scheduledAtMatch[1],
          `${scheduledAtMatch[2]}:${scheduledAtMatch[3]}`,
          subscription.serviceTimeZone,
        );
      } catch {
        throw new HttpsError('invalid-argument', 'L’horaire local du trajet spécial est invalide.');
      }
      const periodStartAtUtc = toDate(subscription.periodStartAtUtc);
      const periodEndAtUtc = toDate(subscription.periodEndAtUtc);
      if (!periodStartAtUtc || !periodEndAtUtc || scheduledAtUtc < periodStartAtUtc || scheduledAtUtc >= periodEndAtUtc) {
        throw new HttpsError('failed-precondition', 'Le trajet spécial doit être compris dans la période du forfait.');
      }

      const planId = getPlanId(subscription);
      if (!planId) {
        throw new HttpsError('failed-precondition', 'La formule du forfait est invalide.');
      }
      const includedSpecialTrips = SPECIAL_TRIP_LIMITS[planId];
      const persistedIncludedSpecialTrips = subscription.includedSpecialTrips;
      const specialTripsUsed = subscription.specialTripsUsed;
      const monthlyDistanceKm = subscription.monthlyDistanceKm;
      const monthlyDistanceKmRemaining = subscription.monthlyDistanceKmRemaining;
      const specialTripsDistanceUsedKm = subscription.specialTripsDistanceUsedKm;
      if (
        !isNonNegativeInteger(persistedIncludedSpecialTrips)
        || persistedIncludedSpecialTrips !== includedSpecialTrips
        || !isNonNegativeInteger(specialTripsUsed)
        || specialTripsUsed > persistedIncludedSpecialTrips
        || !isFiniteNumber(monthlyDistanceKm)
        || monthlyDistanceKm <= 0
        || !isFiniteNumber(monthlyDistanceKmRemaining)
        || monthlyDistanceKmRemaining < 0
        || monthlyDistanceKmRemaining > monthlyDistanceKm
        || !isFiniteNumber(specialTripsDistanceUsedKm)
        || specialTripsDistanceUsedKm < 0
      ) {
        throw new HttpsError('failed-precondition', 'Les quotas autoritatifs du forfait sont incomplets ou invalides.');
      }
      if (specialTripsUsed >= persistedIncludedSpecialTrips) {
        throw new HttpsError('failed-precondition', 'Votre quota de trajets spéciaux est épuisé pour cette période.');
      }

      const distanceKm = authoritativeRoute.distanceKm;
      if (distanceKm > monthlyDistanceKmRemaining) {
        throw new HttpsError('failed-precondition', 'Ce trajet dépasse le kilométrage restant de votre forfait.');
      }
      const nextRemainingDistanceKm = roundDistance(monthlyDistanceKmRemaining - distanceKm);

      transaction.set(tripRef, {
        subscriptionId: payload.subscriptionId,
        userId: uid,
        planId,
        direction: 'special',
        isSpecialTrip: true,
        pickupAddress: payload.pickupAddress,
        destinationAddress: payload.destinationAddress,
        pickupLocation,
        scheduledAtIso: scheduledAtUtc.toISOString(),
        status: 'scheduled',
        distanceKm,
        assignedDriverId: null,
        assignedVehicleId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(subscriptionRef, {
        specialTripsUsed: admin.firestore.FieldValue.increment(1),
        specialTripsDistanceUsedKm: admin.firestore.FieldValue.increment(distanceKm),
        monthlyDistanceKmRemaining: nextRemainingDistanceKm,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        kind: 'created' as const,
        success: true,
        tripId: tripRef.id,
        specialTripsRemaining: Math.max(0, persistedIncludedSpecialTrips - specialTripsUsed - 1),
      };
    });
    if (result.kind === 'expired') {
      throw new HttpsError('failed-precondition', 'Le forfait a expiré.');
    }
    return {
      success: result.success,
      tripId: result.tripId,
      specialTripsRemaining: result.specialTripsRemaining,
    };
  },
);
