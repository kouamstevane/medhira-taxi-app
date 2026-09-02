import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import type Stripe from 'stripe';
import { z } from 'zod';
import { createStripeClient } from '../stripe/stripe-client.js';
import { isSubscriptionEntitled, markExpiredSubscriptionInTransaction } from './entitlement.js';
import { cancelPersonalDriverTrip } from './cancelPersonalDriverTrip.js';
import {
  createSubscriptionPeriodLockId,
  releaseSubscriptionPeriodLock,
} from './subscriptionPeriodLock.js';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

let stripe: InstanceType<typeof Stripe> | null = null;

function getStripe(): InstanceType<typeof Stripe> {
  if (!stripe) stripe = createStripeClient(stripeSecretKey.value().trim());
  return stripe;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

async function assertAdminUser(uid: string): Promise<void> {
  const db = getDb();
  const adminDoc = await db.collection('admins').doc(uid).get();
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'Réservé aux administrateurs.');
  }
}

function assertAssignableDriver(driverId: string, driver: FirebaseFirestore.DocumentData | undefined): void {
  if (!driver) {
    throw new HttpsError('not-found', 'Chauffeur introuvable.');
  }

  const approved =
    driver?.status === 'approved' ||
    driver?.driverStatus === 'approved' ||
    driver?.kycStatus === 'approved';
  if (!approved) {
    throw new HttpsError('failed-precondition', 'Le chauffeur doit être approuvé avant affectation.');
  }

  if (driver?.isAvailable === false || driver?.availabilityStatus === 'busy_personal_driver') {
    throw new HttpsError('failed-precondition', 'Le chauffeur sélectionné n’est pas disponible.');
  }
}

function assertAssignableVehicle(vehicle: FirebaseFirestore.DocumentData | undefined): void {
  if (!vehicle) {
    throw new HttpsError('not-found', 'Véhicule introuvable.');
  }
  if (
    vehicle.status !== 'available'
    || vehicle.isAvailable === false
    || vehicle.availabilityStatus === 'unavailable'
  ) {
    throw new HttpsError('failed-precondition', 'Le véhicule sélectionné n’est pas disponible.');
  }
}

function assertTripSubscriptionEntitled(
  trip: FirebaseFirestore.DocumentData | undefined,
  subscription: FirebaseFirestore.DocumentData | undefined,
): void {
  const subscriptionId = trip?.subscriptionId;
  if (typeof subscriptionId !== 'string' || !subscriptionId) {
    throw new HttpsError('failed-precondition', 'Le forfait du trajet est introuvable.');
  }
  if (!isSubscriptionEntitled(subscription, new Date())) {
    throw new HttpsError('failed-precondition', 'Le forfait doit être payé et actif avant affectation.');
  }
}

function parseTripScheduledDate(tripData: FirebaseFirestore.DocumentData | undefined): Date | null {
  if (!tripData) return null;
  const val = tripData.scheduledAtUtc ?? tripData.scheduledAtIso ?? tripData.scheduledAt;
  if (val instanceof Date) return Number.isFinite(val.getTime()) ? val : null;
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => unknown }).toDate === 'function') {
    const d = (val as { toDate: () => unknown }).toDate();
    return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof val === 'string' && val.trim()) {
    const d = new Date(val);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

const SCHEDULE_COLLISION_WINDOW_MS = 60 * 60 * 1000;
const PERSONAL_DRIVER_PLAN_IDS = ['basic', 'classic', 'premium'] as const;

function assertNoScheduleCollision(
  targetTripId: string,
  targetScheduledDate: Date | null,
  assignedTripsDocs: FirebaseFirestore.QueryDocumentSnapshot[],
): void {
  if (!targetScheduledDate) return;
  for (const doc of assignedTripsDocs) {
    if (doc.id === targetTripId) continue;
    const existingDate = parseTripScheduledDate(doc.data());
    if (!existingDate) continue;
    const diffMs = Math.abs(existingDate.getTime() - targetScheduledDate.getTime());
    if (diffMs < SCHEDULE_COLLISION_WINDOW_MS) {
      throw new HttpsError(
        'failed-precondition',
        'Le chauffeur sélectionné a déjà un autre trajet planifié dans ce créneau horaire (fenêtre de 1h).',
      );
    }
  }
}

const planIdSchema = z.enum(PERSONAL_DRIVER_PLAN_IDS, {
  error: 'Identifiant de forfait invalide.',
});

const trimmedTextSchema = (min: number, max: number, message: string) => z.string()
  .trim()
  .min(min, message)
  .max(max, message);

const personalDriverPlanSchema = z.object({
  id: planIdSchema,
  name: trimmedTextSchema(1, 80, 'Le nom doit contenir entre 1 et 80 caractères.'),
  badge: z.string()
    .trim()
    .max(80, 'Le badge doit contenir au maximum 80 caractères.')
    .optional(),
  promise: trimmedTextSchema(1, 200, 'La promesse doit contenir entre 1 et 200 caractères.'),
  pricePerKm: z.number()
    .finite()
    .min(0, 'Le prix par km doit être compris entre 0 et 1000.')
    .max(1000, 'Le prix par km doit être compris entre 0 et 1000.'),
  minimumBillableKm: z.number()
    .int('La distance minimale doit être un entier positif inférieur ou égal à 100000.')
    .positive('La distance minimale doit être un entier positif inférieur ou égal à 100000.')
    .max(100000, 'La distance minimale doit être un entier positif inférieur ou égal à 100000.'),
  minimumAmount: z.number()
    .finite()
    .min(0, 'Le montant minimum doit être compris entre 0 et 1000000.')
    .max(1000000, 'Le montant minimum doit être compris entre 0 et 1000000.'),
  allowedWeekdays: z.array(z.number()
    .int('Les jours autorisés doivent être des entiers entre 0 et 6.')
    .min(0, 'Les jours autorisés doivent être des entiers entre 0 et 6.')
    .max(6, 'Les jours autorisés doivent être des entiers entre 0 et 6.'))
    .min(1, 'Le forfait doit autoriser entre 1 et 7 jours.')
    .max(7, 'Le forfait doit autoriser entre 1 et 7 jours.')
    .refine((weekdays) => new Set(weekdays).size === weekdays.length, 'Les jours autorisés doivent être uniques.'),
  includedRegularWaitMinutes: z.number()
    .int('Les minutes d’attente incluses doivent être comprises entre 0 et 1440.')
    .min(0, 'Les minutes d’attente incluses doivent être comprises entre 0 et 1440.')
    .max(1440, 'Les minutes d’attente incluses doivent être comprises entre 0 et 1440.'),
  includedSpecialTrips: z.number()
    .int('Les trajets spéciaux inclus doivent être compris entre 0 et 100.')
    .min(0, 'Les trajets spéciaux inclus doivent être compris entre 0 et 100.')
    .max(100, 'Les trajets spéciaux inclus doivent être compris entre 0 et 100.'),
  benefits: z.array(trimmedTextSchema(1, 200, 'Chaque avantage doit contenir entre 1 et 200 caractères.'))
    .min(1, 'Le forfait doit contenir entre 1 et 12 avantages.')
    .max(12, 'Le forfait doit contenir entre 1 et 12 avantages.'),
});

const adminActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('updatePlan'),
    plan: personalDriverPlanSchema,
  }),
  z.object({
    action: z.literal('cancelSubscription'),
    subscriptionId: z.string().min(1),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal('cancelTrip'),
    tripId: z.string().min(1),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal('assignTrip'),
    tripId: z.string().min(1),
    driverId: z.string().min(1),
    vehicleId: z.string().min(1),
  }),
  z.object({
    action: z.literal('reassignDriverEmergency'),
    tripId: z.string().min(1),
    newDriverId: z.string().min(1),
    newVehicleId: z.string().min(1),
  }),
  z.object({
    action: z.literal('resolveOperationalReview'),
    tripId: z.string().min(1),
    decision: z.enum(['approve', 'reject']),
    reason: z.string().optional(),
  }),
]);

export const adminManagePersonalDriver = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey] },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    await assertAdminUser(request.auth.uid);
    const adminUid = request.auth.uid;

    const parsed = adminActionSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }

    const db = getDb();
    const payload = parsed.data;

    if (payload.action === 'updatePlan') {
      const plan = {
        id: payload.plan.id,
        name: payload.plan.name,
        badge: payload.plan.badge ? payload.plan.badge : admin.firestore.FieldValue.delete(),
        promise: payload.plan.promise,
        pricePerKm: payload.plan.pricePerKm,
        minimumBillableKm: payload.plan.minimumBillableKm,
        minimumAmount: payload.plan.minimumAmount,
        allowedWeekdays: payload.plan.allowedWeekdays,
        includedRegularWaitMinutes: payload.plan.includedRegularWaitMinutes,
        includedSpecialTrips: payload.plan.includedSpecialTrips,
        benefits: payload.plan.benefits,
      };

      await db.collection('personal_driver_plans').doc(plan.id).set({
        ...plan,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: adminUid,
      }, { merge: true });

      return { success: true, planId: plan.id };
    }

    if (payload.action === 'cancelSubscription') {
      const subRef = db.collection('personal_driver_subscriptions').doc(payload.subscriptionId);
      const cancellation = await db.runTransaction(async (transaction) => {
        const subscriptionSnapshot = await transaction.get(subRef);
        if (!subscriptionSnapshot.exists) {
          throw new HttpsError('not-found', 'Abonnement introuvable.');
        }

        const subscription = subscriptionSnapshot.data();
        const unpaidPending = subscription?.status === 'pending_payment'
          && ['pending', 'requires_action'].includes(subscription.paymentStatus);
        if (!unpaidPending) {
          throw new HttpsError(
            'failed-precondition',
            'Seul un abonnement en attente et non payé peut être annulé sans décision de remboursement.',
          );
        }
        if (
          typeof subscription?.userId !== 'string'
          || typeof subscription?.periodStartDate !== 'string'
          || typeof subscription?.stripePaymentIntentId !== 'string'
        ) {
          throw new HttpsError('failed-precondition', 'Le paiement en attente de cet abonnement est invalide.');
        }
        return {
          userId: subscription.userId,
          periodStartDate: subscription.periodStartDate,
          paymentIntentId: subscription.stripePaymentIntentId,
        };
      });

      const paymentIntent = await getStripe().paymentIntents.retrieve(cancellation.paymentIntentId);
      if (
        paymentIntent.metadata.purpose !== 'personal_driver_subscription'
        || paymentIntent.metadata.subscriptionId !== payload.subscriptionId
        || paymentIntent.metadata.userId !== cancellation.userId
      ) {
        throw new HttpsError('failed-precondition', 'Le PaymentIntent ne correspond pas à cet abonnement.');
      }
      if (paymentIntent.status === 'succeeded') {
        throw new HttpsError(
          'failed-precondition',
          'Le paiement est confirmé. Une décision de remboursement est requise avant toute annulation.',
        );
      }
      if (paymentIntent.status !== 'canceled') {
        try {
          const cancelledPaymentIntent = await getStripe().paymentIntents.cancel(cancellation.paymentIntentId);
          if (cancelledPaymentIntent.status !== 'canceled') {
            throw new HttpsError('failed-precondition', 'Le paiement en attente ne peut pas être annulé.');
          }
        } catch (error) {
          if (error instanceof HttpsError) throw error;
          const latestPaymentIntent = await getStripe().paymentIntents.retrieve(cancellation.paymentIntentId);
          if (latestPaymentIntent.status === 'succeeded') {
            throw new HttpsError(
              'failed-precondition',
              'Le paiement est confirmé. Une décision de remboursement est requise avant toute annulation.',
            );
          }
          if (latestPaymentIntent.status !== 'canceled') {
            throw new HttpsError('failed-precondition', 'Le paiement en attente ne peut pas être annulé.');
          }
        }
      }

      await db.runTransaction(async (transaction) => {
        const subscriptionSnapshot = await transaction.get(subRef);
        if (!subscriptionSnapshot.exists) {
          throw new HttpsError('not-found', 'Abonnement introuvable.');
        }
        const subscription = subscriptionSnapshot.data();
        const matchesCancellationIdentity = subscription?.userId === cancellation.userId
          && subscription.periodStartDate === cancellation.periodStartDate
          && subscription.stripePaymentIntentId === cancellation.paymentIntentId;
        const adminCancellationUpdate = {
          status: 'cancelled',
          paymentStatus: 'cancelled',
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          cancelledBy: adminUid,
          cancelReason: payload.reason || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (subscription?.status === 'cancelled' && subscription.paymentStatus === 'cancelled') {
          if (!matchesCancellationIdentity) {
            throw new HttpsError('failed-precondition', 'L’identité du paiement annulé ne correspond plus.');
          }
          if (typeof subscription.cancelledBy === 'string' && subscription.cancelledBy.trim()) return;
          transaction.update(subRef, adminCancellationUpdate);
          return;
        }
        if (
          !matchesCancellationIdentity
          || subscription.status !== 'pending_payment'
          || !['pending', 'requires_action'].includes(subscription.paymentStatus)
        ) {
          throw new HttpsError('failed-precondition', 'L’état du paiement a changé pendant l’annulation.');
        }

        const lockId = createSubscriptionPeriodLockId(cancellation.userId, cancellation.periodStartDate);
        const lockRef = db.collection('personal_driver_subscription_locks').doc(lockId);
        const released = await releaseSubscriptionPeriodLock(transaction, lockRef, {
          subscriptionId: payload.subscriptionId,
          paymentIntentId: cancellation.paymentIntentId,
        });
        if (!released) {
          throw new HttpsError('failed-precondition', 'Le verrou de période de cet abonnement ne peut pas être libéré.');
        }

        transaction.update(subRef, adminCancellationUpdate);
      });
      return { success: true };
    }

    if (payload.action === 'cancelTrip') {
      await cancelPersonalDriverTrip(db, {
        tripId: payload.tripId,
        actor: { kind: 'admin', uid: adminUid, reason: payload.reason },
      });
      return { success: true };
    }

    if (payload.action === 'assignTrip') {
      const driverRef = db.collection('drivers').doc(payload.driverId);
      const vehicleRef = db.collection('vehicles').doc(payload.vehicleId);
      const tripRef = db.collection('personal_driver_trips').doc(payload.tripId);
      const result = await db.runTransaction(async (transaction) => {
        const tripSnap = await transaction.get(tripRef);
        if (!tripSnap.exists) throw new HttpsError('not-found', 'Trajet introuvable.');
        const trip = tripSnap.data();
        if (trip?.status && !['scheduled', 'driver_assigned'].includes(trip.status)) {
          throw new HttpsError('failed-precondition', 'Ce trajet ne peut pas être affecté dans son statut actuel.');
        }
        if (typeof trip?.subscriptionId !== 'string' || !trip.subscriptionId) {
          throw new HttpsError('failed-precondition', 'Le forfait du trajet est introuvable.');
        }
        const driverTripsQuery = db.collection('personal_driver_trips')
          .where('assignedDriverId', '==', payload.driverId)
          .where('status', 'in', [
            'scheduled',
            'driver_assigned',
            'driver_en_route',
            'driver_arrived',
            'passenger_picked_up',
            'in_progress',
          ]);
        const [subscriptionSnap, driverSnap, vehicleSnap, driverTripsSnap] = await Promise.all([
          transaction.get(db.collection('personal_driver_subscriptions').doc(trip.subscriptionId)),
          transaction.get(driverRef),
          transaction.get(vehicleRef),
          transaction.get(driverTripsQuery),
        ]);
        if (!subscriptionSnap.exists) throw new HttpsError('not-found', 'Abonnement introuvable.');
        if (!driverSnap.exists) throw new HttpsError('not-found', 'Chauffeur introuvable.');
        if (!vehicleSnap.exists) throw new HttpsError('not-found', 'Véhicule introuvable.');
        const subscriptionRef = db.collection('personal_driver_subscriptions').doc(trip.subscriptionId);
        const subscription = subscriptionSnap.data();
        if (markExpiredSubscriptionInTransaction(transaction, subscriptionRef, subscription, new Date())) {
          return { kind: 'expired' as const };
        }
        assertTripSubscriptionEntitled(trip, subscription);
        assertAssignableDriver(payload.driverId, driverSnap.data());
        assertAssignableVehicle(vehicleSnap.data());
        assertNoScheduleCollision(payload.tripId, parseTripScheduledDate(trip), driverTripsSnap.docs);

        transaction.update(tripRef, {
          assignedDriverId: payload.driverId,
          assignedVehicleId: payload.vehicleId,
          status: 'driver_assigned',
          assignedAt: admin.firestore.FieldValue.serverTimestamp(),
          assignedBy: adminUid,
        });
        if (trip?.userId) {
          transaction.set(db.collection('notifications').doc(), {
            userId: trip.userId,
            type: 'personal_driver_trip_assigned',
            title: 'Chauffeur affecté',
            message: 'Un chauffeur et un véhicule ont été affectés à votre trajet Personal Driver.',
            tripId: payload.tripId,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        transaction.set(db.collection('notifications').doc(), {
          userId: payload.driverId,
          type: 'personal_driver_trip_assigned_driver',
          title: 'Nouvelle mission Personal Driver',
          message: 'Une mission Personal Driver vous a été affectée.',
          tripId: payload.tripId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { kind: 'assigned' as const };
      });
      if (result.kind === 'expired') {
        throw new HttpsError('failed-precondition', 'Le forfait a expiré.');
      }
      return { success: true };
    }

    if (payload.action === 'reassignDriverEmergency') {
      const driverRef = db.collection('drivers').doc(payload.newDriverId);
      const vehicleRef = db.collection('vehicles').doc(payload.newVehicleId);
      const tripRef = db.collection('personal_driver_trips').doc(payload.tripId);
      const result = await db.runTransaction(async (transaction) => {
        const tripSnap = await transaction.get(tripRef);
        if (!tripSnap.exists) throw new HttpsError('not-found', 'Trajet introuvable.');
        const trip = tripSnap.data();
        if (typeof trip?.subscriptionId !== 'string' || !trip.subscriptionId) {
          throw new HttpsError('failed-precondition', 'Le forfait du trajet est introuvable.');
        }

        const oldDriverId = typeof trip?.assignedDriverId === 'string' && trip.assignedDriverId
          ? trip.assignedDriverId
          : null;
        let oldDriverRef: FirebaseFirestore.DocumentReference | null = null;
        let oldDriverQuery: FirebaseFirestore.Query | null = null;

        if (oldDriverId && oldDriverId !== payload.newDriverId) {
          oldDriverRef = db.collection('drivers').doc(oldDriverId);
          oldDriverQuery = db.collection('personal_driver_trips')
            .where('assignedDriverId', '==', oldDriverId)
            .where('status', 'in', [
              'scheduled',
              'driver_assigned',
              'driver_en_route',
              'driver_arrived',
              'passenger_picked_up',
              'in_progress',
            ]);
        }

        const newDriverTripsQuery = db.collection('personal_driver_trips')
          .where('assignedDriverId', '==', payload.newDriverId)
          .where('status', 'in', [
            'scheduled',
            'driver_assigned',
            'driver_en_route',
            'driver_arrived',
            'passenger_picked_up',
            'in_progress',
          ]);

        const [subscriptionSnap, driverSnap, vehicleSnap, oldDriverSnap, oldDriverTripsSnap, newDriverTripsSnap] = await Promise.all([
          transaction.get(db.collection('personal_driver_subscriptions').doc(trip.subscriptionId)),
          transaction.get(driverRef),
          transaction.get(vehicleRef),
          oldDriverRef ? transaction.get(oldDriverRef) : Promise.resolve(null),
          oldDriverQuery ? transaction.get(oldDriverQuery) : Promise.resolve(null),
          transaction.get(newDriverTripsQuery),
        ]);

        if (!subscriptionSnap.exists) throw new HttpsError('not-found', 'Abonnement introuvable.');
        if (!driverSnap.exists) throw new HttpsError('not-found', 'Chauffeur introuvable.');
        if (!vehicleSnap.exists) throw new HttpsError('not-found', 'Véhicule introuvable.');
        const subscriptionRef = db.collection('personal_driver_subscriptions').doc(trip.subscriptionId);
        const subscription = subscriptionSnap.data();
        if (markExpiredSubscriptionInTransaction(transaction, subscriptionRef, subscription, new Date())) {
          return { kind: 'expired' as const };
        }
        assertTripSubscriptionEntitled(trip, subscription);
        assertAssignableDriver(payload.newDriverId, driverSnap.data());
        assertAssignableVehicle(vehicleSnap.data());
        assertNoScheduleCollision(payload.tripId, parseTripScheduledDate(trip), newDriverTripsSnap.docs);

        if (oldDriverRef && oldDriverSnap && oldDriverSnap.exists) {
          const hasOtherAssignments = oldDriverTripsSnap
            ? oldDriverTripsSnap.docs.some((doc) => doc.id !== tripRef.id)
            : false;
          if (!hasOtherAssignments) {
            transaction.update(oldDriverRef, {
              isAvailable: true,
              availabilityStatus: 'available',
              activePersonalDriverTripId: null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          transaction.set(db.collection('notifications').doc(), {
            userId: oldDriverId,
            type: 'personal_driver_emergency_reassignment_old_driver',
            title: 'Mission réaffectée',
            message: 'Votre mission Personal Driver a été réaffectée à un autre chauffeur par un administrateur.',
            tripId: payload.tripId,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        transaction.update(tripRef, {
          assignedDriverId: payload.newDriverId,
          assignedVehicleId: payload.newVehicleId,
          status: 'driver_assigned',
          driverAlertFlagged: false,
          emergencyReassignedAt: admin.firestore.FieldValue.serverTimestamp(),
          emergencyReassignedBy: adminUid,
        });
        if (trip?.userId) {
          transaction.set(db.collection('notifications').doc(), {
            userId: trip.userId,
            type: 'personal_driver_emergency_reassignment',
            title: 'Chauffeur remplacé',
            message: 'Un chauffeur de remplacement a été affecté à votre trajet Personal Driver.',
            tripId: payload.tripId,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        transaction.set(db.collection('notifications').doc(), {
          userId: payload.newDriverId,
          type: 'personal_driver_emergency_reassignment_driver',
          title: 'Mission de remplacement',
          message: 'Une mission Personal Driver de remplacement vous a été affectée.',
          tripId: payload.tripId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { kind: 'reassigned' as const };
      });
      if (result.kind === 'expired') {
        throw new HttpsError('failed-precondition', 'Le forfait a expiré.');
      }
      return { success: true };
    }

    if (payload.action === 'resolveOperationalReview') {
      const tripRef = db.collection('personal_driver_trips').doc(payload.tripId);
      await db.runTransaction(async (transaction) => {
        const tripSnap = await transaction.get(tripRef);
        if (!tripSnap.exists) throw new HttpsError('not-found', 'Trajet introuvable.');
        const trip = tripSnap.data();
        if (!trip?.operationalReviewRequired) {
          throw new HttpsError('failed-precondition', 'Aucun examen opérationnel requis sur ce trajet.');
        }

        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        const assignedDriverId = typeof trip?.assignedDriverId === 'string' && trip.assignedDriverId
          ? trip.assignedDriverId
          : null;

        if (payload.decision === 'approve') {
          const statusHistory = trip?.statusHistory || [];
          statusHistory.push({
            status: 'driver_arrived',
            changedAt: new Date().toISOString(),
            changedBy: adminUid,
            location: null,
            note: 'Approuvé par examen opérationnel administrateur',
          });

          transaction.update(tripRef, {
            operationalReviewRequired: false,
            operationalReviewResolvedAt: timestamp,
            operationalReviewResolvedBy: adminUid,
            operationalReviewDecision: 'approve',
            ...(payload.reason ? { operationalReviewResolutionReason: payload.reason } : {}),
            status: 'driver_arrived',
            statusHistory,
            waitStartedAt: timestamp,
            waitEndedAt: admin.firestore.FieldValue.delete(),
            overageChargeStatus: admin.firestore.FieldValue.delete(),
            overageChargeClaimedAt: admin.firestore.FieldValue.delete(),
            overageChargeIdempotencyKey: admin.firestore.FieldValue.delete(),
            overagePaymentIntentId: admin.firestore.FieldValue.delete(),
            overageWaitBilled: admin.firestore.FieldValue.delete(),
            updatedAt: timestamp,
          });

          if (assignedDriverId) {
            transaction.set(db.collection('notifications').doc(), {
              userId: assignedDriverId,
              type: 'personal_driver_gps_review_approved',
              title: 'Validation GPS approuvée',
              message: 'L’administrateur a validé votre arrivée sur le lieu de prise en charge.',
              tripId: payload.tripId,
              read: false,
              createdAt: timestamp,
            });
          }
        } else {
          transaction.update(tripRef, {
            operationalReviewRequired: false,
            operationalReviewResolvedAt: timestamp,
            operationalReviewResolvedBy: adminUid,
            operationalReviewDecision: 'reject',
            ...(payload.reason ? { operationalReviewResolutionReason: payload.reason } : {}),
            updatedAt: timestamp,
          });

          if (assignedDriverId) {
            transaction.set(db.collection('notifications').doc(), {
              userId: assignedDriverId,
              type: 'personal_driver_gps_review_rejected',
              title: 'Validation GPS rejetée',
              message: 'L’administrateur n’a pas validé la demande d’arrivée GPS pour ce trajet.',
              tripId: payload.tripId,
              read: false,
              createdAt: timestamp,
            });
          }
        }
      });
      return { success: true };
    }

    throw new HttpsError('invalid-argument', 'Action non reconnue.');
  },
);
