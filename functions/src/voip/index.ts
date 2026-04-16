/**
 * Cloud Functions Firebase pour les appels VoIP
 * Gère la création, réponse et fin des appels via Agora RTC
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

// Secrets Agora - migrés depuis functions.config() / process.env
const agoraAppId = defineSecret('AGORA_APP_ID');
const agoraAppCertificate = defineSecret('AGORA_APP_CERTIFICATE');

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

const voipRateLimits = new Map<string, { count: number; resetAt: number }>();
function checkVoipRateLimit(uid: string, action: string, maxCalls: number, windowSeconds: number): void {
  const key = `${uid}:${action}`;
  const now = Date.now();
  const entry = voipRateLimits.get(key);
  if (entry && now < entry.resetAt) {
    if (entry.count >= maxCalls) {
      throw new HttpsError('resource-exhausted', `Rate limit exceeded for ${action}. Try again later.`);
    }
    entry.count++;
  } else {
    voipRateLimits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
  }
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
 * Génère un nom de channel Agora unique
 */
function generateAgoraChannel(rideId: string): string {
  return `call_${rideId}_${Date.now()}`;
}

/**
 * Génère un token Agora signé pour un channel et un uid
 * En dev (sans certificat), retourne '' (Agora autorise les tests sans token)
 * 
 *  FIX: Les valeurs des secrets sont passées en paramètres pour éviter
 * les dépendances implicites sur defineSecret().value() en dehors du contexte
 * de la Cloud Function.
 */
function generateAgoraToken(
  channel: string,
  uid: string,
  appId: string,
  appCertificate: string
): string {
  if (!appCertificate) {
    // Mode développement: Agora permet les tests sans token si App Certificate est désactivé
    console.warn('[VoIP] AGORA_APP_CERTIFICATE non configuré — token vide (mode dev uniquement)');
    return '';
  }

  try {
    const expirationTimeInSeconds = 3600; // 1 heure
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Utiliser 0 comme UID int pour permettre à n'importe quel UID string de rejoindre
    return RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channel,
      0, // UID 0 = wildcard
      RtcRole.PUBLISHER,
      privilegeExpiredTs,
      privilegeExpiredTs // Token expire time (même que privilegeExpiredTs)
    );
  } catch (error) {
    console.error('[VoIP] Erreur génération token Agora:', error);
    console.error('[VoIP] Assurez-vous que le package agora-token est installé: npm install agora-token');
    return '';
  }
}

/**
 * Crée un nouvel appel VoIP
 */
export const createCall = onCall(
  { secrets: [agoraAppId, agoraAppCertificate] },
  async (request: CallableRequest) => {
  // 1. Vérifier l'authentification
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Utilisateur non authentifié');
  }

  checkVoipRateLimit(request.auth.uid, 'createCall', 10, 60);

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

  // 6. Générer le channel et token Agora
  const channel = generateAgoraChannel(rideId);
  const token = generateAgoraToken(
    channel,
    callerId,
    agoraAppId.value(),
    agoraAppCertificate.value()
  );

  // 7. Créer le document d'appel — le token n'est PAS persisté en Firestore
  // pour éviter qu'un tiers authentifié puisse le lire et accéder au canal audio.
  // Le token est retourné uniquement à l'appelant via la réponse de la fonction.
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
    }
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
        // Le token Agora n'est pas inclus dans FCM : le destinataire doit appeler
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

  checkVoipRateLimit(request.auth.uid, 'answerCall', 20, 60);

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

  checkVoipRateLimit(request.auth.uid, 'endCall', 20, 60);

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
 * Récupère un token Agora pour rejoindre un canal d'appel existant
 * Le destinataire d'un appel utilise cette fonction après réception du FCM
 */
export const getCallToken = onCall(
  { secrets: [agoraAppId, agoraAppCertificate] },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Utilisateur non authentifié');
    }

    checkVoipRateLimit(request.auth.uid, 'getCallToken', 20, 60);

    const { callId } = request.data as { callId?: string };
    const userId = request.auth.uid;

    if (!callId) {
      throw new HttpsError('invalid-argument', 'callId manquant');
    }

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

    const token = generateAgoraToken(
      callData.channel,
      userId,
      agoraAppId.value(),
      agoraAppCertificate.value()
    );

    return {
      token,
      channel: callData.channel,
      uid: userId
    };
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

  checkVoipRateLimit(request.auth.uid, 'sendSystemMessage', 10, 60);

  const { bookingId, content, recipient } = request.data as { bookingId?: string; content?: string; recipient?: string };

  if (!bookingId || !content) {
    throw new HttpsError('invalid-argument', 'bookingId et content requis');
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
