import { httpsCallable } from 'firebase/functions';
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
} from 'firebase/firestore';
import { db, functions } from '@/config/firebase';
import type {
  PersonalDriverPlanId,
  PersonalDriverSubscription,
  PersonalDriverTrip,
  PersonalDriverTripType,
  PersonalDriverWeekday,
} from '@/types/personal-driver';

export interface CreatePersonalDriverSubscriptionPaymentInput {
  selectedPlanId: PersonalDriverPlanId;
  requestId: string;
  pickupAddress: string;
  destinationAddress: string;
  tripType: PersonalDriverTripType;
  selectedWeekdays: PersonalDriverWeekday[];
  departureTime: string;
  returnTime?: string;
  startDate: string;
  distanceOneWayKm: number;
  distanceReturnKm: number;
  monthlyDistanceKm: number;
  passengerCount: number;
  notes?: string;
}

interface ClientManagePersonalDriverResult {
  success: boolean;
  tripId?: string;
  specialTripsRemaining?: number;
}

export interface CreatePersonalDriverSubscriptionPaymentResult {
  subscriptionId: string;
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
}

export async function createPersonalDriverSubscriptionPayment(
  input: CreatePersonalDriverSubscriptionPaymentInput,
): Promise<CreatePersonalDriverSubscriptionPaymentResult> {
  const callable = httpsCallable<
    CreatePersonalDriverSubscriptionPaymentInput,
    CreatePersonalDriverSubscriptionPaymentResult
  >(functions, 'createPersonalDriverSubscriptionPayment');

  const response = await callable(input);
  return response.data;
}

export async function getCurrentPersonalDriverSubscription(
  userId: string,
): Promise<PersonalDriverSubscription | null> {
  if (!userId) return null;

  const q = query(
    collection(db, 'personal_driver_subscriptions'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(1),
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data(),
  } as PersonalDriverSubscription;
}

export async function getPersonalDriverTripsForSubscription(
  subscriptionId: string,
): Promise<PersonalDriverTrip[]> {
  if (!subscriptionId) return [];

  const q = query(
    collection(db, 'personal_driver_trips'),
    where('subscriptionId', '==', subscriptionId),
    orderBy('scheduledAtIso', 'asc'),
    limit(100),
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as PersonalDriverTrip[];
}

export async function cancelPersonalDriverTripByClient(tripId: string): Promise<void> {
  const callable = httpsCallable<
    { action: 'cancelTrip'; tripId: string },
    ClientManagePersonalDriverResult
  >(functions, 'clientManagePersonalDriver');
  await callable({ action: 'cancelTrip', tripId });
}

export async function requestSpecialTrip(
  subscriptionId: string,
  userId: string,
  planId: PersonalDriverPlanId,
  pickupAddress: string,
  destinationAddress: string,
  scheduledAtIso: string,
  distanceKm: number,
): Promise<void> {
  void userId;
  void planId;
  const callable = httpsCallable<
    {
      action: 'requestSpecialTrip';
      subscriptionId: string;
      pickupAddress: string;
      destinationAddress: string;
      scheduledAtIso: string;
      distanceKm: number;
    },
    ClientManagePersonalDriverResult
  >(functions, 'clientManagePersonalDriver');
  await callable({
    action: 'requestSpecialTrip',
    subscriptionId,
    pickupAddress,
    destinationAddress,
    scheduledAtIso,
    distanceKm,
  });
}
