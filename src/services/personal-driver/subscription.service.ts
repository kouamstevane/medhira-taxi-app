import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
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
  const functions = getFunctions(undefined, 'europe-west1');
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
  const { doc, updateDoc } = await import('firebase/firestore');
  const tripRef = doc(db, 'personal_driver_trips', tripId);
  await updateDoc(tripRef, {
    status: 'cancelled',
    cancelledBy: 'client',
    clientCancelledLostKm: true,
    updatedAt: new Date().toISOString(),
  });
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
  const { doc, collection, addDoc, updateDoc, increment } = await import('firebase/firestore');
  const tripsRef = collection(db, 'personal_driver_trips');
  await addDoc(tripsRef, {
    subscriptionId,
    userId,
    planId,
    direction: 'special',
    isSpecialTrip: true,
    pickupAddress,
    destinationAddress,
    scheduledAtIso,
    status: 'scheduled',
    distanceKm,
    assignedDriverId: null,
    assignedVehicleId: null,
    createdAt: new Date().toISOString(),
  });

  const subRef = doc(db, 'personal_driver_subscriptions', subscriptionId);
  await updateDoc(subRef, {
    specialTripsUsed: increment(1),
  });
}
