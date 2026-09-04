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
import { auth, db, functions } from '@/config/firebase';
import type {
  PersonalDriverPlanId,
  PersonalDriverAuthoritativeQuote,
  RequestSpecialTripResult,
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
  status?: 'active';
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

function isPendingRenewal(subscription: PersonalDriverSubscription): boolean {
  if (subscription.status !== 'pending_payment'
    || typeof subscription.sourceSubscriptionId !== 'string'
    || !subscription.sourceSubscriptionId.trim()) return false;
  const awaitingPayment = ['creating', 'pending', 'requires_action'].includes(
    subscription.paymentStatus ?? '',
  );
  const awaitingActivation = subscription.paymentStatus === 'succeeded'
    && ['activating', 'activation_failed'].includes(subscription.activationStatus ?? '');
  return awaitingPayment || awaitingActivation;
}

function getPendingPeriodRank(
  subscription: PersonalDriverSubscription,
  now: Date,
): number | null {
  const periodStart = toDate(subscription.periodStartAtUtc);
  const periodEnd = toDate(subscription.periodEndAtUtc);
  if (periodEnd && periodEnd <= now) return null;
  if (periodStart && periodEnd && periodEnd <= periodStart) return null;
  if (!periodStart || !periodEnd) return Number.POSITIVE_INFINITY;
  return Math.max(0, periodStart.getTime() - now.getTime());
}

function isFutureActiveSubscription(
  subscription: PersonalDriverSubscription,
  now: Date,
): boolean {
  const periodStart = toDate(subscription.periodStartAtUtc);
  return subscription.status === 'active'
    && subscription.paymentStatus === 'succeeded'
    && !!periodStart
    && periodStart > now;
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
    limit(20),
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
  const pending = subscriptions
    .filter((subscription) => isPendingActivation(subscription)
      || isFutureActiveSubscription(subscription, now))
    .map((subscription) => ({
      rank: getPendingPeriodRank(subscription, now),
      subscription,
    }))
    .filter((candidate): candidate is { rank: number; subscription: PersonalDriverSubscription } =>
      candidate.rank !== null)
    .sort((left, right) => left.rank - right.rank)[0]?.subscription ?? null;

  return { active, pending };
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
  if (!userId) return null;
  const subscriptionsQuery = query(
    collection(db, 'personal_driver_subscriptions'),
    where('userId', '==', userId),
    where('status', '==', 'pending_payment'),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  const snapshot = await getDocs(subscriptionsQuery);
  return snapshot.docs
    .map((subscriptionDoc) => ({
      id: subscriptionDoc.id,
      ...subscriptionDoc.data(),
    }) as PersonalDriverSubscription)
    .find(isPendingRenewal) ?? null;
}

export async function getPersonalDriverTripsForSubscription(
  subscriptionId: string,
  userId?: string,
): Promise<PersonalDriverTrip[]> {
  if (!subscriptionId) return [];

  const currentUserId = userId || auth.currentUser?.uid;
  if (currentUserId) {
    const q = query(
      collection(db, 'personal_driver_trips'),
      where('userId', '==', currentUserId),
      orderBy('scheduledAtIso', 'asc'),
      limit(100),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as PersonalDriverTrip)
      .filter((trip) => !subscriptionId || trip.subscriptionId === subscriptionId);
  }

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

export async function retryPersonalDriverSubscriptionActivation(
  subscriptionId: string,
): Promise<{ success: boolean; status?: 'active' }> {
  const callable = httpsCallable<
    { action: 'retryActivation'; subscriptionId: string },
    ClientManagePersonalDriverResult
  >(functions, 'clientManagePersonalDriver');
  const response = await callable({ action: 'retryActivation', subscriptionId });
  return response.data;
}

export async function requestSpecialTrip(
  subscriptionId: string,
  userId: string,
  planId: PersonalDriverPlanId,
  pickupAddress: string,
  destinationAddress: string,
  scheduledAtIso: string,
  distanceKm: number,
): Promise<RequestSpecialTripResult> {
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
    RequestSpecialTripResult
  >(functions, 'clientManagePersonalDriver');
  const response = await callable({
    action: 'requestSpecialTrip',
    subscriptionId,
    pickupAddress,
    destinationAddress,
    scheduledAtIso,
    distanceKm,
  });
  return response.data;
}
