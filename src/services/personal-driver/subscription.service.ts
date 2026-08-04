import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  limit,
  orderBy,
} from 'firebase/firestore';
import { db, functions } from '@/config/firebase';
import type {
  PersonalDriverPlanId,
  PersonalDriverAuthoritativeQuote,
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
  quote: PersonalDriverAuthoritativeQuote;
}

export type RenewPersonalDriverSubscriptionPaymentResult = CreatePersonalDriverSubscriptionPaymentResult;

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

export async function renewPersonalDriverSubscriptionPayment(
  sourceSubscriptionId: string,
  requestId: string,
  pendingSubscriptionId?: string,
): Promise<RenewPersonalDriverSubscriptionPaymentResult> {
  const callable = httpsCallable<
    { sourceSubscriptionId: string; requestId: string; pendingSubscriptionId?: string },
    RenewPersonalDriverSubscriptionPaymentResult
  >(functions, 'renewPersonalDriverSubscriptionPayment');
  const response = await callable({
    sourceSubscriptionId,
    requestId,
    ...(pendingSubscriptionId ? { pendingSubscriptionId } : {}),
  });
  return response.data;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function containsDate(subscription: PersonalDriverSubscription, date: Date): boolean {
  const periodStart = toDate(subscription.periodStartAtUtc);
  const periodEnd = toDate(subscription.periodEndAtUtc);
  return !!periodStart && !!periodEnd && periodEnd > periodStart && date >= periodStart && date < periodEnd;
}

function isPendingActivation(subscription: PersonalDriverSubscription): boolean {
  if (subscription.status !== 'pending_payment') return false;
  if (['creating', 'pending', 'requires_action'].includes(subscription.paymentStatus ?? '')) return true;
  return subscription.paymentStatus === 'succeeded'
    && (subscription.activationStatus === undefined
      || ['pending_payment', 'activating', 'activation_failed'].includes(subscription.activationStatus));
}

export async function getPersonalDriverSubscriptionView(userId: string): Promise<{
  active: PersonalDriverSubscription | null;
  pending: PersonalDriverSubscription | null;
}> {
  if (!userId) return { active: null, pending: null };

  const subscriptionsQuery = query(
    collection(db, 'personal_driver_subscriptions'),
    where('userId', '==', userId),
    where('status', 'in', ['active', 'pending_payment']),
    orderBy('createdAt', 'desc'),
  );
  const snapshot = await getDocs(subscriptionsQuery);
  const subscriptions = snapshot.docs.map((subscriptionDoc) => ({
    id: subscriptionDoc.id,
    ...subscriptionDoc.data(),
  })) as PersonalDriverSubscription[];
  const now = new Date();
  const active = subscriptions
    .filter((subscription) => subscription.status === 'active'
      && subscription.paymentStatus === 'succeeded'
      && containsDate(subscription, now))
    .sort((left, right) => (
      toDate(right.periodStartAtUtc)?.getTime() ?? 0
    ) - (
      toDate(left.periodStartAtUtc)?.getTime() ?? 0
    ))[0] ?? null;
  const pendingActivation = subscriptions.find(isPendingActivation) ?? null;
  const futureActive = subscriptions
    .filter((subscription) => subscription.status === 'active'
      && subscription.paymentStatus === 'succeeded'
      && (toDate(subscription.periodStartAtUtc)?.getTime() ?? 0) > now.getTime())
    .sort((left, right) => (
      toDate(left.periodStartAtUtc)?.getTime() ?? Number.MAX_SAFE_INTEGER
    ) - (
      toDate(right.periodStartAtUtc)?.getTime() ?? Number.MAX_SAFE_INTEGER
    ))[0] ?? null;

  return { active, pending: pendingActivation ?? futureActive };
}

export async function getCurrentPersonalDriverSubscription(
  userId: string,
): Promise<PersonalDriverSubscription | null> {
  return (await getPersonalDriverSubscriptionView(userId)).active;
}

export async function getPersonalDriverSubscriptionById(
  subscriptionId: string,
): Promise<PersonalDriverSubscription | null> {
  if (!subscriptionId) return null;
  const snapshot = await getDoc(doc(db, 'personal_driver_subscriptions', subscriptionId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as PersonalDriverSubscription;
}

export async function getPendingPersonalDriverRenewal(
  userId: string,
): Promise<PersonalDriverSubscription | null> {
  return (await getPersonalDriverSubscriptionView(userId)).pending;
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
