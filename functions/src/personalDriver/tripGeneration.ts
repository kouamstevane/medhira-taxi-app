import * as admin from 'firebase-admin';
import { buildPersonalDriverTripDrafts } from './schedule.js';
import type { PersonalDriverPlanId, PersonalDriverWeekday } from './pricing.js';
import type { PersonalDriverCoordinate } from './geolocation.js';

type PersonalDriverTripType = 'one_way' | 'round_trip';

export interface PersonalDriverTripGenerationSubscription {
  id: string;
  userId: string;
  status: string;
  paymentStatus: string;
  periodStartDate: string;
  periodEndDateExclusive: string;
  serviceTimeZone: string;
  selectedWeekdays: PersonalDriverWeekday[];
  tripType: PersonalDriverTripType;
  departureTime: string;
  returnTime?: string | null;
  pickupAddress: string;
  destinationAddress: string;
  pickupLocation: PersonalDriverCoordinate;
  selectedPlanId?: PersonalDriverPlanId;
  planId?: PersonalDriverPlanId;
  distanceOneWayKm: number;
  distanceReturnKm: number;
}

export async function generatePersonalDriverTrips(
  db: FirebaseFirestore.Firestore,
  subscription: PersonalDriverTripGenerationSubscription,
): Promise<void> {
  if (subscription.status !== 'active' || subscription.paymentStatus !== 'succeeded') return;

  const drafts = buildPersonalDriverTripDrafts({
    subscriptionId: subscription.id,
    userId: subscription.userId,
    periodStartDate: subscription.periodStartDate,
    periodEndDateExclusive: subscription.periodEndDateExclusive,
    serviceTimeZone: subscription.serviceTimeZone,
    selectedWeekdays: subscription.selectedWeekdays,
    tripType: subscription.tripType,
    departureTime: subscription.departureTime,
    returnTime: subscription.returnTime ?? undefined,
    pickupAddress: subscription.pickupAddress,
    destinationAddress: subscription.destinationAddress,
    pickupLocation: subscription.pickupLocation,
    planId: subscription.selectedPlanId ?? subscription.planId ?? 'basic',
    distanceOneWayKm: subscription.distanceOneWayKm,
    distanceReturnKm: subscription.distanceReturnKm,
  });
  const tripRefs = drafts.map((_, index) => db.collection('personal_driver_trips').doc(`${subscription.id}_${index}`));

  await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(tripRefs.map((tripRef) => transaction.get(tripRef)));
    snapshots.forEach((snapshot, index) => {
      if (snapshot.exists) return;
      transaction.create(tripRefs[index], {
        ...drafts[index],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  });
}
