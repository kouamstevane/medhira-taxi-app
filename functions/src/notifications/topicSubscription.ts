import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const ALLOWED_TOPIC_PATTERNS: RegExp[] = [
  /^all_drivers$/,
  /^all_passengers$/,
  /^available_drivers$/,
  /^active_trips$/,
  /^drivers_[a-zA-Z0-9_]+$/,
  /^passengers_[a-zA-Z0-9_]+$/,
  /^orders_[a-zA-Z0-9]+$/,
  /^bookings_[a-zA-Z0-9]+$/,
];

function isValidTopic(topic: string): boolean {
  return ALLOWED_TOPIC_PATTERNS.some((pattern) => pattern.test(topic));
}

async function resolveFcmToken(uid: string, token?: string): Promise<string> {
  if (token && typeof token === 'string') return token;
  const db = admin.firestore();
  const [userDoc, driverDoc] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('drivers').doc(uid).get(),
  ]);
  const fcmToken = userDoc.data()?.fcmToken ?? driverDoc.data()?.fcmToken;
  if (!fcmToken || typeof fcmToken !== 'string') {
    throw new HttpsError('failed-precondition', 'Token FCM introuvable.');
  }
  return fcmToken;
}

async function manageTopicSubscription(
  request: CallableRequest,
  operation: 'subscribe' | 'unsubscribe'
): Promise<{ success: true }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
  }

  await enforceRateLimit({
    identifier: request.auth.uid,
    bucket: `fcm:topic:${operation}`,
    limit: 30,
    windowSec: 60,
  });

  const { topic, token } = request.data as { topic?: string; token?: string };

  if (!topic || typeof topic !== 'string') {
    throw new HttpsError('invalid-argument', 'Topic manquant ou invalide.');
  }

  if (!isValidTopic(topic)) {
    throw new HttpsError('invalid-argument', 'Topic non autorisé.');
  }

  const fcmToken = await resolveFcmToken(request.auth.uid, token);
  const logTag = operation === 'subscribe' ? '[subscribeToTopic]' : '[unsubscribeFromTopic]';
  const errorMsg =
    operation === 'subscribe'
      ? "Erreur lors de l'abonnement au topic."
      : 'Erreur lors du désabonnement du topic.';

  try {
    const response =
      operation === 'subscribe'
        ? await admin.messaging().subscribeToTopic([fcmToken], topic)
        : await admin.messaging().unsubscribeFromTopic([fcmToken], topic);
    if (response.failureCount > 0) {
      console.error(`${logTag} Failure:`, response.errors[0]?.error?.message);
      throw new HttpsError('internal', errorMsg);
    }
    return { success: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error(`${logTag} Error:`, error);
    throw new HttpsError('internal', errorMsg);
  }
}

export const subscribeToTopic = onCall(
  { region: 'europe-west1', cors: true },
  (request: CallableRequest) => manageTopicSubscription(request, 'subscribe')
);

export const unsubscribeFromTopic = onCall(
  { region: 'europe-west1', cors: true },
  (request: CallableRequest) => manageTopicSubscription(request, 'unsubscribe')
);
