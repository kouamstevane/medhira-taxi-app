/**
 * Cloud Functions Firebase pour les appels VoIP
 * Gère la création, réponse et fin des appels via Agora RTC
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialiser Firebase Admin si pas déjà fait
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const fcm = admin.messaging();

// Configuration Agora depuis les variables d'environnement Firebase
// Note: functions.config() est déprécié dans v2, utiliser process.env
const AGORA_APP_ID = process.env.AGORA_APP_ID || '';
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || '';

/**
 * Valide que l'appartient à l'utilisateur
 */
async function validateRideAccess(rideId: string, userId: string): Promise<boolean> {
  const rideDoc = await db.collection('bookings').doc(rideId).get();
  
  if (!rideDoc.exists) {
    return false;
  }

  const rideData = rideDoc.data();
  return rideData?.userId === userId || rideData?.driverId === userId;
}

/**
 * Vérifie si un appel est déjà en cours pour cette course
 */
async function hasActiveCallForRide(bookingId: string): Promise<boolean> {
  const snapshot = await db.collection('calls')
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
  const userDoc = await db.collection('users').doc(userId).get();
  let fcmToken = userDoc.data()?.fcmToken;
  
  if (!fcmToken) {
    const driverDoc = await db.collection('drivers').doc(userId).get();
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
 */
function generateAgoraToken(channel: string, uid: string): string {
  if (!AGORA_APP_CERTIFICATE) {
    // Mode développement: Agora permet les tests sans token si App Certificate est désactivé
    console.warn('[VoIP] AGORA_APP_CERTIFICATE non configuré — token vide (mode dev uniquement)');
    return '';
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RtcTokenBuilder, RtcRole } = require('agora-token');
    const expirationTimeInSeconds = 3600; // 1 heure
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Utiliser 0 comme UID int pour permettre à n'importe quel UID string de rejoindre
    return RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channel,
      0, // UID 0 = wildcard
      RtcRole.PUBLISHER,
      privilegeExpiredTs
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
export const createCall = functions.https.onCall(async (data: any, context: any) => {
  // 1. Vérifier l'authentification
  if (!context?.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Utilisateur non authentifié');
  }

  const callerId = context.auth.uid;
  const { calleeId, rideId } = data;

  // 2. Valider les paramètres
  if (!calleeId || !rideId) {
    throw new functions.https.HttpsError('invalid-argument', 'Paramètres manquants');
  }

  // 3. Valider l'accès à la course
  const hasAccess = await validateRideAccess(rideId, callerId);
  if (!hasAccess) {
    throw new functions.https.HttpsError('permission-denied', 'Accès non autorisé à cette course');
  }

  // 3.5. Valider que le destinataire existe
  const calleeDoc = await db.collection('users').doc(calleeId).get();
  if (!calleeDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Destinataire introuvable');
  }

  // 4. Vérifier qu'il n'y a pas déjà un appel en cours
  const hasActiveCall = await hasActiveCallForRide(rideId);
  if (hasActiveCall) {
    throw new functions.https.HttpsError('already-exists', 'Un appel est déjà en cours pour cette course');
  }

  // 5. Récupérer les métadonnées de l'appelant
  const callerDoc = await db.collection('users').doc(callerId).get();
  const callerData = callerDoc.data();
  
  // Déterminer le rôle de l'appelant
  const rideDoc = await db.collection('bookings').doc(rideId).get();
  const rideData = rideDoc.data();
  const callerRole = rideData?.userId === callerId ? 'client' : 'chauffeur';

  // 6. Générer le channel et token Agora
  const channel = generateAgoraChannel(rideId);
  const token = generateAgoraToken(channel, callerId);

  // 7. Créer le document d'appel
  const callRef = await db.collection('calls').add({
    callerId,
    calleeId,
    rideId,
    status: 'ringing',
    startTime: admin.firestore.FieldValue.serverTimestamp(),
    channel,
    token,
    callerMetadata: {
      name: callerData?.displayName || 'Utilisateur',
      avatar: callerData?.photoURL || null,
      role: callerRole,
      uid: callerId
    }
  });

  // 8. Envoyer la notification FCM au destinataire
  const fcmToken = await getUserFcmToken(calleeId);
  const callerDataForNotif = callerData;

  if (fcmToken) {
    const message = {
      token: fcmToken,
      notification: {
        title: '📞 Appel entrant',
        body: `${callerDataForNotif?.displayName || callerDataForNotif?.name || 'Utilisateur'} vous appelle`,
        imageUrl: callerDataForNotif?.photoURL || undefined
      },
      data: {
        type: 'incoming_call',
        callId: callRef.id,
        rideId,
        channel,
        token,
        callerName: callerDataForNotif?.displayName || callerDataForNotif?.name || 'Utilisateur',
        callerAvatar: callerDataForNotif?.photoURL || '',
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
      await fcm.send(message);
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
export const answerCall = functions.https.onCall(async (data: any, context: any) => {
  if (!context?.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Utilisateur non authentifié');
  }

  const { callId } = data;
  const userId = context.auth.uid;

  if (!callId) {
    throw new functions.https.HttpsError('invalid-argument', 'callId manquant');
  }

  const callRef = db.collection('calls').doc(callId);
  const callDoc = await callRef.get();

  if (!callDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Appel non trouvé');
  }

  const callData = callDoc.data();

  if (callData?.calleeId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Cet appel ne vous est pas destiné');
  }

  if (callData?.status !== 'ringing') {
    throw new functions.https.HttpsError('failed-precondition', 'Cet appel n\'est plus disponible');
  }

  await callRef.update({
    status: 'accepted',
    answerTime: admin.firestore.FieldValue.serverTimestamp()
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
export const endCall = functions.https.onCall(async (data: any, context: any) => {
  if (!context?.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Utilisateur non authentifié');
  }

  const { callId, reason } = data;
  const userId = context.auth.uid;

  if (!callId) {
    throw new functions.https.HttpsError('invalid-argument', 'callId manquant');
  }

  const callRef = db.collection('calls').doc(callId);
  const callDoc = await callRef.get();

  if (!callDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Appel non trouvé');
  }

  const callData = callDoc.data();

  if (callData?.callerId !== userId && callData?.calleeId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Vous n\'êtes pas participant à cet appel');
  }

  const endTime = admin.firestore.Timestamp.now();
  
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
 * Nettoie les anciens appels (RGPD - après 24h)
 * Note: Pour Firebase Functions v2, utiliser onSchedule avec pubsub
 */
export const cleanupOldCalls = functions.https.onRequest(async (req, res) => {
  // Note: Cette fonction devrait être déployée comme scheduled function
  // Utiliser plutôt: firebase-functions/v2/pubsub ou deploy via gcloud scheduler
  const cutoff = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() - 24 * 60 * 60 * 1000)  // 24h
  );

  const oldCalls = await db.collection('calls')
    .where('endTime', '<', cutoff)
    .limit(500)
    .get();

  if (oldCalls.empty) {
    console.log('No old calls to clean up');
    res.json({ success: true, deletedCount: 0 });
    return;
  }

  const batch = db.batch();
  oldCalls.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  
  console.log(`Cleaned up ${oldCalls.size} old calls (RGPD compliance)`);
  
  res.json({ success: true, deletedCount: oldCalls.size });
});

/**
 * Trigger: Auto-annulation des appels sans réponse après 30s
 * Note: Pour Firebase Functions v2, utiliser onDocumentCreated
 * Pour l'instant, cette logique est gérée côté client via timeout
 */
export const handleCallTimeout = functions.https.onRequest(async (req, res) => {
  res.json({ success: true, message: 'Timeout handled client-side' });
  return;
});

/**
 * Envoie un message système dans une conversation de course
 * Utilise Admin SDK pour contourner les security rules (senderId='system')
 */
export const sendSystemMessage = functions.https.onCall(async (data: any, context: any) => {
  if (!context?.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Utilisateur non authentifié');
  }

  const { bookingId, content, recipient } = data;

  if (!bookingId || !content) {
    throw new functions.https.HttpsError('invalid-argument', 'bookingId et content requis');
  }

  // Vérifier que l'appelant est participant à la course
  const bookingDoc = await db.collection('bookings').doc(bookingId).get();
  if (!bookingDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Course non trouvée');
  }

  const bookingData = bookingDoc.data();
  const userId = context.auth.uid;
  if (bookingData?.userId !== userId && bookingData?.driverId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Vous n\'êtes pas participant à cette course');
  }

  // Le senderType simulé pour incrémenter le bon compteur
  const simulatedSenderType = recipient === 'client' ? 'driver' : 'client';

  // Écrire le message avec Admin SDK (pas de restrictions security rules)
  await db.collection('bookings').doc(bookingId).collection('messages').add({
    bookingId,
    senderId: 'system',
    senderName: 'Système',
    senderType: simulatedSenderType,
    type: 'system',
    content,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Mettre à jour le compteur de messages non lus
  const unreadField = simulatedSenderType === 'client'
    ? 'unreadMessages.driver'
    : 'unreadMessages.client';

  await db.collection('bookings').doc(bookingId).update({
    lastMessage: content,
    lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    [unreadField]: admin.firestore.FieldValue.increment(1),
  });

  return { success: true };
});
