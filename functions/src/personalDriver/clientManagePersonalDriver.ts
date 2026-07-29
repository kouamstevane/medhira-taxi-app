import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';

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

function getPlanId(data: FirebaseFirestore.DocumentData): PersonalDriverPlanId {
  const planId = data.selectedPlanId ?? data.planId;
  if (planId === 'basic' || planId === 'classic' || planId === 'premium') return planId;
  return 'basic';
}

function roundDistance(value: number): number {
  return Math.round(value * 10) / 10;
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
    distanceKm: z.number().finite().positive().max(1000),
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
    return db.runTransaction(async (transaction) => {
      const subscriptionSnap = await transaction.get(subscriptionRef);
      if (!subscriptionSnap.exists) {
        throw new HttpsError('not-found', 'Abonnement introuvable.');
      }

      const subscription = subscriptionSnap.data();
      if (subscription?.userId !== uid) {
        throw new HttpsError('permission-denied', 'Cet abonnement ne vous appartient pas.');
      }
      if (subscription.status !== 'active') {
        throw new HttpsError('failed-precondition', 'Les trajets spéciaux sont disponibles après activation de l’abonnement.');
      }

      const planId = getPlanId(subscription);
      const includedSpecialTrips = SPECIAL_TRIP_LIMITS[planId];
      const specialTripsUsed = Number(subscription.specialTripsUsed ?? 0);
      if (specialTripsUsed >= includedSpecialTrips) {
        throw new HttpsError('failed-precondition', 'Votre quota de trajets spéciaux est épuisé pour cette période.');
      }

      const monthlyDistanceKm = Number(subscription.monthlyDistanceKm ?? 0);
      const specialTripsDistanceUsedKm = Number(subscription.specialTripsDistanceUsedKm ?? 0);
      const remainingDistanceKm = roundDistance(monthlyDistanceKm - specialTripsDistanceUsedKm);
      if (monthlyDistanceKm > 0 && payload.distanceKm > remainingDistanceKm) {
        throw new HttpsError('failed-precondition', 'Ce trajet dépasse le kilométrage restant de votre forfait.');
      }
      const nextRemainingDistanceKm = monthlyDistanceKm > 0
        ? roundDistance(remainingDistanceKm - payload.distanceKm)
        : null;

      transaction.set(tripRef, {
        subscriptionId: payload.subscriptionId,
        userId: uid,
        planId,
        direction: 'special',
        isSpecialTrip: true,
        pickupAddress: payload.pickupAddress,
        destinationAddress: payload.destinationAddress,
        scheduledAtIso: payload.scheduledAtIso,
        status: 'scheduled',
        distanceKm: payload.distanceKm,
        assignedDriverId: null,
        assignedVehicleId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(subscriptionRef, {
        specialTripsUsed: admin.firestore.FieldValue.increment(1),
        specialTripsDistanceUsedKm: admin.firestore.FieldValue.increment(payload.distanceKm),
        ...(nextRemainingDistanceKm !== null ? { monthlyDistanceKmRemaining: nextRemainingDistanceKm } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        tripId: tripRef.id,
        specialTripsRemaining: Math.max(0, includedSpecialTrips - specialTripsUsed - 1),
      };
    });
  },
);
