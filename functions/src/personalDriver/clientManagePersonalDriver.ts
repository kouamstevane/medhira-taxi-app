import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { calculateServerRoute } from './routeDistance.js';
import { isSubscriptionEntitled, markExpiredSubscriptionInTransaction } from './entitlement.js';
import { localDateTimeToUtc, resolveAddressCoordinates } from './locationTimeZone.js';
import { assertFutureSpecialTrip } from './subscriptionSchedule.js';
import { cancelPersonalDriverTrip } from './cancelPersonalDriverTrip.js';
import { generatePersonalDriverTrips } from './tripGeneration.js';
import { isPersonalDriverSubscriptionReadyForActivation } from './subscriptionActivationValidation.js';

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

function parseSpecialTripScheduledAt(scheduledAtIso: string, serviceTimeZone: unknown): Date {
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(scheduledAtIso);
  if (!match || typeof serviceTimeZone !== 'string') {
    throw new HttpsError('invalid-argument', 'Date ou fuseau du trajet spécial invalide.');
  }
  try {
    return localDateTimeToUtc(match[1], `${match[2]}:${match[3]}`, serviceTimeZone);
  } catch {
    throw new HttpsError('invalid-argument', 'L’horaire local du trajet spécial est invalide.');
  }
}

function assertSpecialTripIsFuture(scheduledAtUtc: Date, now: Date): void {
  try {
    assertFutureSpecialTrip(scheduledAtUtc, now);
  } catch {
    throw new HttpsError('invalid-argument', 'Le trajet spécial doit être planifié au moins 2 heures à l’avance.');
  }
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
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  }),
  z.object({
    action: z.literal('retryActivation'),
    subscriptionId: z.string().trim().min(1).max(128),
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
      await cancelPersonalDriverTrip(db, {
        tripId: payload.tripId,
        actor: { kind: 'client', uid },
      });
      return { success: true };
    }

    const subscriptionRef = db.collection('personal_driver_subscriptions').doc(payload.subscriptionId);
    const subscriptionSnapshot = await subscriptionRef.get();
    if (!subscriptionSnapshot.exists) {
      throw new HttpsError('not-found', 'Abonnement introuvable.');
    }
    const initialSubscription = subscriptionSnapshot.data();
    if (initialSubscription?.userId !== uid) {
      throw new HttpsError('permission-denied', 'Cet abonnement ne vous appartient pas.');
    }

    if (payload.action === 'retryActivation') {
      if (initialSubscription.paymentStatus !== 'succeeded') {
        throw new HttpsError('failed-precondition', 'Le paiement de cet abonnement n’est pas confirmé.');
      }
      if (initialSubscription.status === 'active' && initialSubscription.activationStatus === 'active') {
        return { success: true, status: 'active' };
      }
      if (!isPersonalDriverSubscriptionReadyForActivation(initialSubscription)) {
        throw new HttpsError('failed-precondition', 'Les informations nécessaires à l’activation sont incomplètes.');
      }

      const activationSubscription = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(subscriptionRef);
        if (!snapshot.exists) {
          throw new HttpsError('not-found', 'Abonnement introuvable.');
        }
        const subscription = snapshot.data();
        if (subscription?.userId !== uid || subscription.paymentStatus !== 'succeeded') {
          throw new HttpsError('failed-precondition', 'L’état du paiement a changé.');
        }
        if (subscription.status === 'active' && subscription.activationStatus === 'active') {
          return null;
        }
        if (!isPersonalDriverSubscriptionReadyForActivation(subscription)) {
          throw new HttpsError('failed-precondition', 'Les informations nécessaires à l’activation sont incomplètes.');
        }
        transaction.update(subscriptionRef, {
          status: 'pending_payment',
          activationStatus: 'activating',
          activationError: null,
        });
        return {
          ...subscription,
          id: payload.subscriptionId,
          status: 'pending_payment',
          paymentStatus: 'succeeded',
          activationStatus: 'activating',
        };
      });

      if (!activationSubscription) return { success: true, status: 'active' };

      try {
        await generatePersonalDriverTrips(
          db,
          activationSubscription as Parameters<typeof generatePersonalDriverTrips>[1],
        );
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(subscriptionRef);
          if (!snapshot.exists) return;
          const subscription = snapshot.data();
          if (
            subscription?.userId !== uid
            || subscription.paymentStatus !== 'succeeded'
            || subscription.activationStatus !== 'activating'
          ) return;
          transaction.update(subscriptionRef, {
            status: 'active',
            activationStatus: 'active',
            activationError: null,
          });
        });
        return { success: true, status: 'active' };
      } catch (error) {
        const activationError = (error instanceof Error ? error.message : String(error)).slice(0, 500);
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(subscriptionRef);
          if (!snapshot.exists) return;
          const subscription = snapshot.data();
          if (
            subscription?.userId !== uid
            || subscription.paymentStatus !== 'succeeded'
            || subscription.activationStatus !== 'activating'
          ) return;
          transaction.update(subscriptionRef, {
            status: 'pending_payment',
            activationStatus: 'activation_failed',
            activationError,
          });
        });
        throw new HttpsError('internal', 'La préparation des trajets a échoué. Réessayez dans quelques instants.');
      }
    }

    const initialNow = new Date();
    if (isSubscriptionEntitled(initialSubscription, initialNow)) {
      const initialScheduledAtUtc = parseSpecialTripScheduledAt(
        payload.scheduledAtIso,
        initialSubscription.serviceTimeZone,
      );
      assertSpecialTripIsFuture(initialScheduledAtUtc, initialNow);
    }

    const tripRef = payload.idempotencyKey
      ? db.collection('personal_driver_trips').doc(`pd_trip_${payload.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`)
      : db.collection('personal_driver_trips').doc();

    const [authoritativeRoute, pickupLocation] = await Promise.all([
      calculateServerRoute({
        origin: payload.pickupAddress,
        destination: payload.destinationAddress,
      }),
      resolveAddressCoordinates(payload.pickupAddress),
    ]);

    const result = await db.runTransaction(async (transaction) => {
      const [subscriptionSnap, existingTripSnap] = await Promise.all([
        transaction.get(subscriptionRef),
        payload.idempotencyKey ? transaction.get(tripRef) : Promise.resolve(null),
      ]);

      if (!subscriptionSnap.exists) {
        throw new HttpsError('not-found', 'Abonnement introuvable.');
      }

      const subscription = subscriptionSnap.data();
      if (subscription?.userId !== uid) {
        throw new HttpsError('permission-denied', 'Cet abonnement ne vous appartient pas.');
      }

      if (payload.idempotencyKey && existingTripSnap && existingTripSnap.exists) {
        const existingTrip = existingTripSnap.data();
        if (existingTrip?.userId !== uid) {
          throw new HttpsError('permission-denied', 'Ce trajet ne vous appartient pas.');
        }
        const planId = getPlanId(subscription || {});
        const includedSpecialTrips = planId ? SPECIAL_TRIP_LIMITS[planId] : 0;
        const specialTripsUsed = subscription?.specialTripsUsed ?? 0;
        const remainingDistance = subscription?.monthlyDistanceKmRemaining ?? 0;

        return {
          kind: 'created' as const,
          success: true,
          tripId: tripRef.id,
          officialDistanceKm: existingTrip?.distanceKm ?? 0,
          specialTripsRemaining: Math.max(0, includedSpecialTrips - specialTripsUsed),
          monthlyDistanceKmRemaining: remainingDistance,
        };
      }

      const transactionNow = new Date();
      if (markExpiredSubscriptionInTransaction(transaction, subscriptionRef, subscription, transactionNow)) {
        return { kind: 'expired' as const };
      }
      if (!isSubscriptionEntitled(subscription, transactionNow)) {
        throw new HttpsError('failed-precondition', 'Les trajets spéciaux sont disponibles après activation de l’abonnement.');
      }

      const scheduledAtUtc = parseSpecialTripScheduledAt(payload.scheduledAtIso, subscription.serviceTimeZone);
      assertSpecialTripIsFuture(scheduledAtUtc, transactionNow);
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
        throw new HttpsError('failed-precondition', 'Votre quota de trajets spéciaux me est épuisé pour cette période.');
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
        ...(payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : {}),
        pickupAddress: payload.pickupAddress,
        destinationAddress: payload.destinationAddress,
        pickupLocation,
        scheduledAtIso: scheduledAtUtc.toISOString(),
        status: 'scheduled',
        distanceKm,
        specialTripDistanceUsage: {
          policy: 'monthly_distance_allowance',
          officialDistanceKm: distanceKm,
          monthlyDistanceKmRemainingBefore: monthlyDistanceKmRemaining,
          monthlyDistanceKmRemainingAfter: nextRemainingDistanceKm,
        },
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
        officialDistanceKm: distanceKm,
        specialTripsRemaining: Math.max(0, persistedIncludedSpecialTrips - specialTripsUsed - 1),
        monthlyDistanceKmRemaining: nextRemainingDistanceKm,
      };
    });
    if (result.kind === 'expired') {
      throw new HttpsError('failed-precondition', 'Le forfait a expiré.');
    }
    return {
      success: result.success,
      tripId: result.tripId,
      officialDistanceKm: result.officialDistanceKm,
      specialTripsRemaining: result.specialTripsRemaining,
      monthlyDistanceKmRemaining: result.monthlyDistanceKmRemaining,
    };
  },
);
