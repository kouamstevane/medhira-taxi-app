/**
 * Cloud Functions Firebase pour les appels VoIP
 * Gère la création, réponse et fin des appels via Twilio Voice
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import twilio from 'twilio';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
const twilioApiKey = defineSecret('TWILIO_API_KEY');
const twilioApiSecret = defineSecret('TWILIO_API_SECRET');
const twilioOutgoingApplicationSid = defineSecret('TWILIO_OUTGOING_APPLICATION_SID');

// Initialiser Firebase Admin si pas déjà fait
function getAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin;
}

function getDb() {
  return getAdmin().firestore();
}

function getMessaging() {
  return getAdmin().messaging();
}

/**
 * VoIP rate-limit wrapper.
 *
 * Previously used a module-scope `Map` — reset on cold start and divergent
 * across Cloud Function instances, allowing trivial bypass. Now delegates
 * to the shared Firestore-backed limiter (see ../utils/rateLimiter.ts).
 * Bucket names, limits and windows are preserved to keep behavior identical.
 */
async function checkVoipRateLimit(
  uid: string,
  action: string,
  maxCalls: number,
  windowSeconds: number,
): Promise<void> {
  await enforceRateLimit({
    identifier: uid,
    bucket: `voip:${action}`,
    limit: maxCalls,
    windowSec: windowSeconds,
    message: `Rate limit exceeded for ${action}. Try again later.`,
  });
}


/**
 * Valide que l'appartient à l'utilisateur
 */
async function validateRideAccess(rideId: string, userId: string): Promise<boolean> {
  const rideDoc = await getDb().collection('bookings').doc(rideId).get();
  
  if (!rideDoc.exists) {
    return false;
  }

  const rideData = rideDoc.data() as { userId: string; driverId: string } | undefined;
  return rideData?.userId === userId || rideData?.driverId === userId;
}

/**
 * Vérifie si un appel est déjà en cours pour cette course
 */
async function hasActiveCallForRide(bookingId: string): Promise<boolean> {
  const snapshot = await getDb().collection('calls')
    .where('rideId', '==', bookingId)
    .where('status', 'in', ['ringing', 'accepted'])
    .limit(1)
    .get();

  return !snapshot.empty;
}

/**
 * Récupère le token FCM d'un utilisateur depuis users ou drivers
 */
async function getUserFcmToken(userId: string): Promise<string | undefined> {
  const userDoc = await getDb().collection('users').doc(userId).get();
  let fcmToken = userDoc.data()?.fcmToken;
  
  if (!fcmToken) {
    const driverDoc = await getDb().collection('drivers').doc(userId).get();
    fcmToken = driverDoc.data()?.fcmToken;
  }
  
  return fcmToken;
}

/**
 * Génère un nom de channel unique
 */
function generateChannel(rideId: string): string {
  return `call_${rideId}_${Date.now()}`;
}

/**
 * Génère un Twilio Access Token pour les appels vocaux
 *
 *  FIX: Les valeurs des secrets sont passées en paramètres pour éviter
 * les dépendances implicites sur defineSecret().value() en dehors du contexte
 * de la Cloud Function.
 */
function generateTwilioToken(
  uid: string,
  accountSid: string,
  apiKey: string,
  apiSecret: string,
  outgoingApplicationSid: string
): string {
  try {
    const expirationTimeInSeconds = 3600;
    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: uid,
      ttl: expirationTimeInSeconds,
    });

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid,
      incomingAllow: true,
    });

    token.addGrant(voiceGrant);

    return token.toJwt();
  } catch (error) {
    console.error('[VoIP] Erreur génération token Twilio:', error);
    throw error;
  }
}

/**
 * Crée un nouvel appel VoIP
 */
export const createCall = onCall(
  { secrets: [twilioAccountSid, twilioApiKey, twilioApiSecret, twilioOutgoingApplicationSid] },
  async (request: CallableRequest) => {
  // 1. Vérifier l'authentification
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Utilisateur non authentifié');
  }

  await checkVoipRateLimit(request.auth.uid, 'createCall', 10, 60);

  const callerId = request.auth.uid;
  const data = request.data as { calleeId?: string; rideId?: string };
  const { calleeId, rideId } = data;

  // 2. Valider les paramètres
  if (!calleeId || !rideId) {
    throw new HttpsError('invalid-argument', 'Paramètres manquants');
  }

  // 3. Valider l'accès à la course
  const hasAccess = await validateRideAccess(rideId, callerId);
  if (!hasAccess) {
    throw new HttpsError('permission-denied', 'Accès non autorisé à cette course');
  }

  // 3.5. Valider que le destinataire existe (clients dans 'users', chauffeurs dans 'drivers')
  const [calleeUserDoc, calleeDriverDoc] = await Promise.all([
    getDb().collection('users').doc(calleeId).get(),
    getDb().collection('drivers').doc(calleeId).get(),
  ]);
  if (!calleeUserDoc.exists && !calleeDriverDoc.exists) {
    throw new HttpsError('not-found', 'Destinataire introuvable');
  }

  // 4. Vérifier qu'il n'y a pas déjà un appel en cours
  const hasActiveCall = await hasActiveCallForRide(rideId);
  if (hasActiveCall) {
    throw new HttpsError('already-exists', 'Un appel est déjà en cours pour cette course');
  }

  // 5. Récupérer les métadonnées de l'appelant
  const callerDoc = await getDb().collection('users').doc(callerId).get();
  const callerData = callerDoc.data() as { displayName?: string; photoURL?: string; name?: string } | undefined;
  
  // Déterminer le rôle de l'appelant
  const rideDoc = await getDb().collection('bookings').doc(rideId).get();
  const rideData = rideDoc.data() as { userId: string; driverId: string } | undefined;
  const callerRole = rideData?.userId === callerId ? 'client' : 'chauffeur';

  // 6. Générer le channel et token Twilio
  const channel = generateChannel(rideId);
  const token = generateTwilioToken(
    callerId,
    twilioAccountSid.value(),
    twilioApiKey.value(),
    twilioApiSecret.value(),
    twilioOutgoingApplicationSid.value()
  );

  // 7. Créer le document d'appel — le token n'est PAS persisté en Firestore
  // pour éviter qu'un tiers authentifié puisse le lire et accéder au canal audio.
  // Le token est retourné uniquement à l'appelant via la réponse de la fonction.
  const now = Date.now();
  const callRef = await getDb().collection('calls').add({
    callerId,
    calleeId,
    rideId,
    status: 'ringing',
    startTime: getAdmin().firestore.FieldValue.serverTimestamp(),
    channel,
    callerMetadata: {
      name: callerData?.displayName || 'Utilisateur',
      avatar: callerData?.photoURL || null,
      role: callerRole,
      uid: callerId
    },
    expiresAt: getAdmin().firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000)
  });

  // 8. Envoyer la notification FCM au destinataire
  const fcmToken = await getUserFcmToken(calleeId);
  if (fcmToken) {
    const message = {
      token: fcmToken,
      notification: {
        title: '📞 Appel entrant',
        body: `${callerData?.displayName || callerData?.name || 'Utilisateur'} vous appelle`,
        imageUrl: callerData?.photoURL || undefined
      },
      data: {
        type: 'incoming_call',
        callId: callRef.id,
        rideId,
        channel,
        // Le token Twilio n'est pas inclus dans FCM : le destinataire doit appeler
        // la Cloud Function getCallToken(callId) pour obtenir son propre token sécurisé.
        callerName: callerData?.displayName || callerData?.name || 'Utilisateur',
        callerAvatar: callerData?.photoURL || '',
        callerRole
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'incoming_calls',
          sound: 'ringtone',
          vibrate: [0, 500, 200, 500]
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'ringtone.caf',
            badge: 1,
            category: 'incoming_call'
          }
        }
      }
    };

    try {
      await getMessaging().send(message);
    } catch (error) {
      console.error('Error sending FCM:', error);
      // Ne pas échouer la fonction si la notification échoue
    }
  }

  // 9. Logger analytics (optionnel - à implémenter si nécessaire)
  // Note: admin.analytics() n'existe pas dans firebase-admin
  // Utilisez Firebase Analytics Admin SDK ou loggez dans une collection analytics
  /*
  await db.collection('analytics').add({
    event: 'voip_call_initiated',
    call_id: callRef.id,
    ride_id: rideId,
    caller_id: callerId,
    callee_id: calleeId,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  */

  return {
    callId: callRef.id,
    channel,
    token
  };
});

/**
 * Répond à un appel entrant
 */
export const answerCall = onCall(
  { secrets: [] },
  async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Utilisateur non authentifié');
  }

  await checkVoipRateLimit(request.auth.uid, 'answerCall', 20, 60);

  const { callId } = request.data as { callId?: string };
  const userId = request.auth.uid;

  if (!callId) {
    throw new HttpsError('invalid-argument', 'callId manquant');
  }

  const callRef = getDb().collection('calls').doc(callId);
  const callDoc = await callRef.get();

  if (!callDoc.exists) {
    throw new HttpsError('not-found', 'Appel non trouvé');
  }

  const callData = callDoc.data() as { callerId: string; calleeId: string; status: string; answerTime?: admin.firestore.Timestamp; rideId?: string } | undefined;

  if (callData?.calleeId !== userId) {
    throw new HttpsError('permission-denied', 'Cet appel ne vous est pas destiné');
  }

  if (callData?.status !== 'ringing') {
    throw new HttpsError('failed-precondition', 'Cet appel n\'est plus disponible');
  }

  await callRef.update({
    status: 'accepted',
    answerTime: getAdmin().firestore.FieldValue.serverTimestamp()
  });

  // Logger analytics (optionnel)
  /*
  await db.collection('analytics').add({
    event: 'voip_call_answered',
    call_id: callId,
    answer_time: callData?.startTime ? Date.now() - callData.startTime.toDate().getTime() : 0,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  */

  return { success: true };
});

/**
 * Termine un appel
 */
export const endCall = onCall(
  { secrets: [] },
  async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Utilisateur non authentifié');
  }

  await checkVoipRateLimit(request.auth.uid, 'endCall', 20, 60);

  const { callId, reason } = request.data as { callId?: string; reason?: string };
  const userId = request.auth.uid;

  if (!callId) {
    throw new HttpsError('invalid-argument', 'callId manquant');
  }

  const callRef = getDb().collection('calls').doc(callId);
  const callDoc = await callRef.get();

  if (!callDoc.exists) {
    throw new HttpsError('not-found', 'Appel non trouvé');
  }

  const callData = callDoc.data() as { callerId: string; calleeId: string; status: string; answerTime?: admin.firestore.Timestamp; rideId?: string } | undefined;

  if (callData?.callerId !== userId && callData?.calleeId !== userId) {
    throw new HttpsError('permission-denied', 'Vous n\'êtes pas participant à cet appel');
  }

  const endTime = getAdmin().firestore.Timestamp.now();
  
  await callRef.update({
    status: 'ended',
    endTime,
    reason: reason || 'user_ended'
  });

  // Calculer la durée
  const duration = callData?.answerTime
    ? endTime.toMillis() - callData.answerTime.toMillis()
    : 0;

  // Logger analytics (optionnel)
  /*
  await db.collection('analytics').add({
    event: 'voip_call_ended',
    call_id: callId,
    duration_seconds: Math.floor(duration / 1000),
    reason: reason || 'user_ended',
    ended_by: callData.callerId === userId ? 'caller' : 'callee',
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  */

  return { success: true, duration: Math.floor(duration / 1000) };
});


/**
 * Récupère un token Twilio pour rejoindre un canal d'appel existant
 * Le destinataire d'un appel utilise cette fonction après réception du FCM
 */
export const getCallToken = onCall(
  { secrets: [twilioAccountSid, twilioApiKey, twilioApiSecret, twilioOutgoingApplicationSid] },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Utilisateur non authentifié');
    }

    await checkVoipRateLimit(request.auth.uid, 'getCallToken', 20, 60);

    const { callId } = request.data as { callId?: string };
    const userId = request.auth.uid;

    if (callId) {
      const callDoc = await getDb().collection('calls').doc(callId).get();

      if (!callDoc.exists) {
        throw new HttpsError('not-found', 'Appel non trouvé');
      }

      const callData = callDoc.data() as {
        callerId: string;
        calleeId: string;
        status: string;
        channel: string;
      } | undefined;

      if (callData?.callerId !== userId && callData?.calleeId !== userId) {
        throw new HttpsError('permission-denied', 'Vous n\'êtes pas participant à cet appel');
      }

      if (callData?.status === 'ended' || callData?.status === 'missed' || callData?.status === 'rejected') {
        throw new HttpsError('failed-precondition', 'Cet appel est terminé');
      }

      const token = generateTwilioToken(
        userId,
        twilioAccountSid.value(),
        twilioApiKey.value(),
        twilioApiSecret.value(),
        twilioOutgoingApplicationSid.value()
      );

      return {
        token,
        channel: callData.channel,
        uid: userId
      };
    }

    const token = generateTwilioToken(
      userId,
      twilioAccountSid.value(),
      twilioApiKey.value(),
      twilioApiSecret.value(),
      twilioOutgoingApplicationSid.value()
    );

    return { token, uid: userId };
  }
);

/**
 * Envoie un message système dans une conversation de course
 * Utilise Admin SDK pour contourner les security rules (senderId='system')
 */
export const sendSystemMessage = onCall(
  { secrets: [] },
  async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Utilisateur non authentifié');
  }

  await checkVoipRateLimit(request.auth.uid, 'sendSystemMessage', 10, 60);

  const { bookingId, content, recipient } = request.data as { bookingId?: string; content?: string; recipient?: string };

  if (!bookingId || !content) {
    throw new HttpsError('invalid-argument', 'bookingId et content requis');
  }
  if (typeof content !== 'string' || content.length > 500) {
    throw new HttpsError('invalid-argument', 'Le contenu doit faire au maximum 500 caractères');
  }

  // Vérifier que l'appelant est participant à la course
  const bookingDoc = await getDb().collection('bookings').doc(bookingId).get();
  if (!bookingDoc.exists) {
    throw new HttpsError('not-found', 'Course non trouvée');
  }

  const bookingData = bookingDoc.data() as { userId: string; driverId: string } | undefined;
  const userId = request.auth.uid;
  if (bookingData?.userId !== userId && bookingData?.driverId !== userId) {
    throw new HttpsError('permission-denied', 'Vous n\'êtes pas participant à cette course');
  }

  // Le senderType simulé pour incrémenter le bon compteur
  const simulatedSenderType = recipient === 'client' ? 'driver' : 'client';

  // Écrire le message avec Admin SDK (pas de restrictions security rules)
  await getDb().collection('bookings').doc(bookingId).collection('messages').add({
    bookingId,
    senderId: 'system',
    senderName: 'Système',
    senderType: simulatedSenderType,
    type: 'system',
    content,
    read: false,
    createdAt: getAdmin().firestore.FieldValue.serverTimestamp(),
  });

  // Mettre à jour le compteur de messages non lus
  const unreadField = simulatedSenderType === 'client'
    ? 'unreadMessages.driver'
    : 'unreadMessages.client';

  await getDb().collection('bookings').doc(bookingId).update({
    lastMessage: content,
    lastMessageAt: getAdmin().firestore.FieldValue.serverTimestamp(),
    [unreadField]: getAdmin().firestore.FieldValue.increment(1),
  });

  return { success: true };
});
