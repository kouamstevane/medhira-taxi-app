/**
 * Cloud Functions Firebase - Validation et Chiffrement Sécurisés
 * 
 * Ce module fournit des fonctions sécurisées côté serveur pour:
 * - La validation des coordonnées bancaires (IBAN, BIC/SWIFT)
 * - Le chiffrement des données sensibles (SSN/NIR, données bancaires)
 * 
 * Toutes les fonctions incluent:
 * - Authentification requise
 * - Rate limiting pour prévenir les abus
 * - Validation des entrées
 * - Logging sécurisé
 * 
 * @module functions
 */

import { onCall, onRequest, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { defineSecret } from 'firebase-functions/params';

// Définir la région par défaut pour toutes les fonctions v2
setGlobalOptions({ region: 'europe-west1' });
import * as admin from 'firebase-admin';
import {
  validateBankData as validateBankDataValidator,
  BankDataValidationResult,
} from './validators/bank.validator.js';
import {
  encryptSensitiveData as encryptData,
} from './utils/encryption.js';
import { createNotification } from './utils/notificationService.js';
import { BankDetailsSchema, EncryptionRequestSchema } from './validators/schemas.js';
import { z } from 'zod';
import { onDocumentWritten, onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as crypto from 'crypto';
import { getDatabase } from 'firebase-admin/database';
import { FieldValue } from 'firebase-admin/firestore';
import { DELIVERY_SHARE_RATE } from './config/stripe.js';
import { selectNearestDriver, type DriverCandidate } from './utils/matching.js';
import { enforceRateLimit } from './utils/rateLimiter.js';
import { createStripeClient } from './stripe/stripe-client.js';
import {
  reverseRestaurantFoodOrderTransfer,
  settleRestaurantForFoodOrder,
} from './stripe/foodOrderSettlement.js';
import {
  buildAssignedFoodDeliveryOrderData,
  buildPickedUpClientAddress,
  canRetryDeliveryAssignment,
  getDeliveryOrderCancellationAfterRefusal,
  getFoodOrderStatusForDeliveryStatus,
  getNextDeliveryAssignmentAttempt,
  getStalePendingPaymentCancellationUpdate,
  isFoodOrderAssignableToDriver,
  isFoodOrderPaymentExpired,
  shouldSkipStaleDeliveryAssignment,
} from './food/foodDeliveryLifecycle.js';

// Lazy imports pour éviter le timeout de déploiement (10s)
type OAuth2Client = import('google-auth-library').OAuth2Client;

type CloudTasksClientLike = {
  queuePath(project: string, location: string, queue: string): string;
  createTask(request: Record<string, unknown>): Promise<unknown>;
};

let _cloudTasksClient: CloudTasksClientLike | null = null;
async function getCloudTasksClient(): Promise<CloudTasksClientLike> {
  if (!_cloudTasksClient) {
    const { CloudTasksClient } = await import('@google-cloud/tasks');
    _cloudTasksClient = new CloudTasksClient();
  }
  return _cloudTasksClient;
}

let _oauthClient: OAuth2Client | null = null;
async function getOAuthClient() {
  if (!_oauthClient) {
    const { OAuth2Client } = await import('google-auth-library');
    _oauthClient = new OAuth2Client();
  }
  return _oauthClient;
}

import { encryptionMasterKey } from './config/secrets.js';
// Définir le secret Resend pour l'envoi d'emails OTP
const resendApiKey = defineSecret('RESEND_API_KEY');
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

// Initialiser Firebase Admin (vérifier si déjà initialisé pour éviter les erreurs)
if (!admin.apps.length) {
  admin.initializeApp();
}

async function setActiveDeliveryOrderClaim(uid: string | undefined | null, orderId: string | null): Promise<void> {
  if (!uid) return;
  try {
    const user = await admin.auth().getUser(uid);
    await admin.auth().setCustomUserClaims(uid, {
      ...(user.customClaims ?? {}),
      activeDeliveryOrderId: orderId,
    });
  } catch (err) {
    console.warn('[setActiveDeliveryOrderClaim] Failed to update claims', { uid, orderId, err });
  }
}

async function setDeliveryTrackingAccess(
  orderId: string,
  driverId: string,
  participantIds: Array<string | undefined | null>,
): Promise<void> {
  const participants = participantIds.reduce<Record<string, boolean>>((acc, uid) => {
    if (uid) acc[uid] = true;
    return acc;
  }, {});

  await admin.database().ref(`delivery_tracking/${orderId}`).update({
    driverId,
    participants,
  });
}

async function scheduleDeliveryOrderTimeout(orderId: string, attemptNumber: number): Promise<void> {
  const cloudTasksClient = await getCloudTasksClient();
  const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!PROJECT_ID) {
    throw new Error('GCLOUD_PROJECT is required to schedule delivery order timeouts');
  }
  const LOCATION = 'europe-west1';
  const queuePath = cloudTasksClient.queuePath(PROJECT_ID, LOCATION, 'delivery-order-timeout');
  await cloudTasksClient.createTask({
    parent: queuePath,
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url: `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/onDeliveryOrderTimeout`,
        oidcToken: {
          serviceAccountEmail: `${PROJECT_ID}@appspot.gserviceaccount.com`,
        },
        body: Buffer.from(JSON.stringify({ orderId, attemptNumber })).toString('base64'),
        headers: { 'Content-Type': 'application/json' },
      },
      scheduleTime: { seconds: Math.floor(Date.now() / 1000) + 90 },
    },
  });
}

/**
 * Rate Limiter simple pour les Cloud Functions
 * Utilise Firestore comme backend pour stocker les compteurs
 */
class RateLimiter {
  private maxRequests: number;
  private windowMs: number;
  private db: admin.firestore.Firestore;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.db = admin.firestore();
  }

  /**
   * Vérifie si une requête est autorisée selon le rate limit
   * 
   * @param identifier - Identifiant unique (uid ou IP)
   * @param keyPrefix - Préfixe pour la clé Firestore
   * @returns true si autorisé, false sinon
   */
  async check(identifier: string, keyPrefix: string): Promise<boolean> {
    const now = Date.now();
    const docRef = this.db.collection('rate_limits').doc(`${keyPrefix}_${identifier}`);

    try {
      // Transaction atomique : read-check-write en une seule opération pour éviter
      // la race condition entre get() et update() sous charge concurrente.
      return await this.db.runTransaction<boolean>(async (tx) => {
        const doc = await tx.get(docRef);

        if (!doc.exists) {
          tx.set(docRef, {
            count: 1,
            windowStart: now,
            lastReset: now,
          });
          return true;
        }

        const data = doc.data()!;
        const timeSinceReset = now - (data.lastReset || 0);

        if (timeSinceReset >= this.windowMs) {
          tx.update(docRef, {
            count: 1,
            lastReset: now,
            windowStart: now,
          });
          return true;
        }

        if (data.count >= this.maxRequests) {
          return false;
        }

        tx.update(docRef, {
          count: FieldValue.increment(1),
        });
        return true;
      });
    } catch (error) {
      console.error('Erreur Rate Limiter:', error);
      // Fail-secure : bloquer la requête si le rate limiter est en panne
      return false;
    }
  }
}

// Initialiser les rate limiters
const bankValidationLimiter = new RateLimiter(10, 60 * 1000); // 10 requêtes / minute
const encryptionLimiter = new RateLimiter(20, 60 * 1000); // 20 requêtes / minute

/**
 * Cloud Function: validateBankDetails
 * 
 * Valide les coordonnées bancaires côté serveur avec l'algorithme IBAN mod-97
 * et les règles de validation BIC/SWIFT.
 * 
 * @param request - La requête contenant les données bancaires à valider
 * @returns Le résultat de la validation avec les erreurs éventuelles
 * 
 * @example
 * // Client-side call
 * import { getFunctions, httpsCallable } from 'firebase/functions';
 * const functions = getFunctions();
 * const validateBankDetails = httpsCallable(functions, 'validateBankDetails');
 * const result = await validateBankDetails({
 *   accountHolder: 'Jean Dupont',
 *   iban: 'FR76 1234 5678 9012 3456 7890 123',
 *   bic: 'BKPAFR2X'
 * });
 */
export const validateBankDetails = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    // Vérifier que l'utilisateur est authentifié
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Vous devez être connecté pour effectuer cette action.'
      );
    }

    // Rate limiting (basé sur l'uid utilisateur)
    const identifier = request.auth.uid || 'anonymous';
    const allowed = await bankValidationLimiter.check(identifier, 'bank_validation');
    if (!allowed) {
      throw new HttpsError(
        'resource-exhausted',
        'Trop de tentatives de validation. Réessayez dans une minute.'
      );
    }

    const data = request.data;
    // RGPD : ne pas logger les PII bancaires (accountHolder, BIC) ni l'IBAN même partiel
    console.log(`[validateBankDetails] Validation request from ${identifier}:`, {
      hasAccountHolder: Boolean(data.accountHolder),
      hasIban: Boolean(data.iban),
      hasBic: Boolean(data.bic),
    });

    // Validation Zod
    const result = BankDetailsSchema.safeParse(data);
    if (!result.success) {
      console.warn(`[validateBankDetails] Zod validation failed for ${identifier}:`, result.error.format());
      throw new HttpsError(
        'invalid-argument',
        'Données bancaires invalides',
        result.error.format()
      );
    }

    // Valider les données bancaires
    const validationResult: BankDataValidationResult = validateBankDataValidator({
      accountHolder: data.accountHolder,
      iban: data.iban,
      bic: data.bic,
    });

    // Retourner le résultat de la validation
    return {
      isValid: validationResult.isValid,
      errors: validationResult.errors,
    };
  }
);

/**
 * Cloud Function: encryptSensitiveData
 * 
 * Chiffre les données sensibles côté serveur avec AES-256-GCM.
 * 
 * Cette fonction remplace le chiffrement côté client pour une sécurité renforcée.
 * Les données sont chiffrées avec une clé dérivée de Firebase Secret Manager
 * (ou variable d'environnement en développement).
 * 
 * @param request - La requête contenant les données sensibles à chiffrer
 * @returns Les données chiffrées avec IV et salt
 * 
 * @example
 * // Client-side call
 * import { getFunctions, httpsCallable } from 'firebase/functions';
 * const functions = getFunctions();
 * const encryptData = httpsCallable(functions, 'encryptSensitiveData');
 * const result = await encryptData({
 *   plaintext: '123456789012' // SSN ou données bancaires en JSON
 * });
 */
export const encryptSensitiveData = onCall(
  { 
    cors: true,
    secrets: [encryptionMasterKey],
  },
  async (request: CallableRequest) => {
    // Vérifier que l'utilisateur est authentifié
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Vous devez être connecté pour effectuer cette action.'
      );
    }

    // Rate limiting
    const identifier = request.auth.uid || 'anonymous';
    const allowed = await encryptionLimiter.check(identifier, 'encryption');
    if (!allowed) {
      throw new HttpsError(
        'resource-exhausted',
        'Trop de tentatives de chiffrement. Réessayez dans une minute.'
      );
    }

    const data = request.data;

    // Validation Zod
    const result = EncryptionRequestSchema.safeParse(data);
    if (!result.success) {
      throw new HttpsError(
        'invalid-argument',
        'Données à chiffrer invalides',
        result.error.format()
      );
    }

    try {
      // Chiffrer les données côté serveur
      //  FIX: Passer la valeur du secret explicitement pour éviter les dépendances implicites
      const encrypted = await encryptData(data.plaintext, encryptionMasterKey.value());

      // Retourner les données chiffrées
      return {
        encrypted: encrypted,
      };
    } catch (error) {
      console.error('Erreur lors du chiffrement:', error);
      throw new HttpsError(
        'internal',
        'Erreur lors du chiffrement des données. Veuillez réessayer.'
      );
    }
  }
);

export { submitDriverApplication, createDriverProfile } from './driver/submitDriverApplication.js';
export { createDriverApplicationUpload, submitDriverApplicationWithCv, notifyDriverApplicationOnCreate, adminGetDriverApplicationCv } from './driver/driverApplication.js';
export { submitRestaurantApplication } from './restaurant/submitRestaurantApplication.js';
export { deleteRestaurant } from './restaurant/deleteRestaurant.js';
export { restaurantManageFoodOrderStatus } from './restaurant/manageFoodOrderStatus.js';
export { createFoodOrder } from './food/createFoodOrder.js';
export { activateClientRole } from './roles/activateClientRole.js';
export { notifyAdminNewRestaurant } from './admin/notifyAdminNewRestaurant.js';
export { cleanupExpiredOnboardingDrafts } from './admin/cleanupExpiredOnboardingDrafts.js';
export { createStripeConnectAccount } from './stripe/createStripeConnectAccount.js';
export { previewMenuFileImport, startMenuFileImport, processMenuImportWorker } from './restaurant/menuImportJobs.js';
export { recoverExpiredMenuImportJobs } from './restaurant/recoverExpiredMenuImportJobs.js';
export { testStoreConnection, saveStoreIntegration, startRestaurantStoreSync } from './restaurant/syncRestaurantStoreApi.js';

/**
 * Cloud Function: cleanupFailedUploads
 *
 * Nettoie les fichiers Storage uploadés lors d'une inscription échouée.
 * Cette fonction doit être appelée avec les droits admin pour pouvoir
 * supprimer des fichiers qui ne sont pas propriétaires de l'utilisateur.
 *
 * @param request - La requête contenant les URLs des fichiers à supprimer
 * @returns Le nombre de fichiers supprimés
 *
 * @example
 * // Client-side call (après échec d'inscription)
 * import { getFunctions, httpsCallable } from 'firebase/functions';
 * const functions = getFunctions();
 * const cleanupFailedUploads = httpsCallable(functions, 'cleanupFailedUploads');
 * const result = await cleanupFailedUploads({
 *   fileUrls: ['https://...', 'https://...']
 * });
 */
export const cleanupFailedUploads = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    // Vérifier que l'utilisateur est authentifié
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Vous devez être connecté pour effectuer cette action.'
      );
    }

    // Rate limit: cleanup is an I/O-heavy admin-ish operation; normal users
    // call it at most a handful of times after a failed signup.
    await enforceRateLimit({
      identifier: request.auth.uid,
      bucket: 'cleanup:failedUploads',
      limit: 10,
      windowSec: 60,
    });

    const cleanupSchema = z.object({
      fileUrls: z.array(z.string().url()).min(1)
    });
    const data = cleanupSchema.parse(request.data);

    let deletedCount = 0;
    const errors: string[] = [];

    // Traiter chaque fichier
    for (const fileUrl of data.fileUrls) {
      try {
        // Extraire le chemin du fichier depuis l'URL
        // Format: https://firebasestorage.googleapis.com/v0/b/bucket/o/drivers%2FuserId%2F...
        const url = new URL(fileUrl);

        // Empêcher SSRF : n'accepter que l'hostname Firebase Storage officiel.
        if (url.hostname !== 'firebasestorage.googleapis.com') {
          errors.push(`Hôte non autorisé: ${url.hostname}`);
          continue;
        }

        const pathMatch = url.pathname.match(/\/o\/(.+)(?:\?|$)/);

        if (!pathMatch) {
          errors.push(`URL invalide: ${fileUrl}`);
          continue;
        }

        // Décoder le chemin (URL encoded)
        const filePath = decodeURIComponent(pathMatch[1]);

        // Vérifier que le fichier appartient à l'utilisateur
        // Format attendu: drivers/userId/...
        if (!filePath.startsWith(`drivers/${request.auth.uid}/`) &&
            !filePath.startsWith(`driver_documents/${request.auth.uid}/`)) {
          errors.push(`Accès non autorisé au fichier: ${filePath}`);
          continue;
        }

        // Supprimer le fichier
        const bucket = admin.storage().bucket();
        const file = bucket.file(filePath);
        
        const [exists] = await file.exists();
        if (!exists) {
          errors.push(`Fichier introuvable: ${filePath}`);
          continue;
        }

        await file.delete();
        deletedCount++;

        // Logging de suppression pour audit
        console.log(`Fichier supprimé (cleanup): ${filePath} par ${request.auth.uid}`);
      } catch (error) {
        console.error(`Erreur lors de la suppression du fichier ${fileUrl}:`, error);
        errors.push(`Erreur suppression: ${fileUrl}`);
      }
    }

    // Retourner le résultat
    return {
      deletedCount,
      totalFiles: data.fileUrls.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
);

/**
 * Cloud Function: cleanupOrphanedFiles (Scheduler)
 *
 * Nettoie automatiquement les fichiers Storage sans document Firestore associé.
 * Exécutée chaque nuit à 3h du matin (Africa/Douala).
 */
export const cleanupOrphanedFiles = onSchedule(
  {
    schedule: '0 3 * * *', // 3h du matin chaque nuit
    timeZone: 'Africa/Douala',
    region: 'europe-west1',
    memory: '512MiB',
  },
  async () => {
    console.log('Démarrage du nettoyage des fichiers orphelins...');

    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    // Lister les fichiers dans le dossier drivers/
    const [files] = await bucket.getFiles({ prefix: 'drivers/' });

    let deletedCount = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        // Extraire l'uid depuis le chemin : drivers/{uid}/...
        const parts = file.name.split('/');
        if (parts.length < 3) continue;

        const uid = parts[1];

        // Vérifier si un document driver existe pour cet uid
        const driverDoc = await db.collection('drivers').doc(uid).get();

        if (!driverDoc.exists) {
          await file.delete();
          deletedCount++;
          console.log(`Fichier orphelin supprimé : ${file.name}`);

          // Audit log
          await db.collection('audit_logs').add({
            action: 'DELETE_ORPHANED_FILE',
            filePath: file.name,
            uid,
            timestamp: FieldValue.serverTimestamp(),
          });
        }
      } catch (err) {
        console.error(`Erreur sur ${file.name}:`, err);
        errors.push(file.name);
      }
    }

    console.log(`Nettoyage terminé : ${deletedCount} fichier(s) supprimé(s), ${errors.length} erreur(s).`);
  }
);

// ============================================================================
// Export des fonctions VoIP
// ============================================================================
// Ces fonctions gèrent les appels via Twilio Voice pour la fonctionnalité d'appel
// entre passagers et chauffeurs.
export { createCall, answerCall, endCall, getCallToken, sendSystemMessage } from './voip/index.js';
export { twimlWebhook } from './voip/twiml.js';

export const onDriverRegistration = onDocumentWritten("drivers/{driverId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();

  if (!afterData) return;

  // L'e-mail est envoyé uniquement quand le statut devient 'pending' (soumission finale)
  const wasPending = beforeData?.status === 'pending';
  const isPending = afterData.status === 'pending';

  if (isPending && !wasPending) {
    const email = afterData.email;

    if (!email) {
      console.warn("Aucun email trouvé pour le chauffeur:", event.params.driverId);
      return;
    }

    // Ce trigger ne fait que logger la transition vers l'état 'pending'.
    console.log(`[DriverRegistration] Chauffeur ${event.params.driverId} passé à l'état 'pending'. Email: ${email}`);
  }
});

// ============================================================================
// Export des fonctions de migration de devise
// ============================================================================
// Ces fonctions permettent de migrer toutes les données existantes d'un pays a un autre avec un taux de conversion.
export { migrateCurrencyToCAD, migrateCurrencyToCADHTTP } from './migrateCurrency.js';

// ============================================================================
// Livraison de Repas — Notification Chauffeurs (Règle 4)
// ============================================================================

/**
 * Cloud Function: onFoodOrderCreated
 * 
 * Déclenchée quand une nouvelle commande de livraison est créée.
 * Notifie les chauffeurs disponibles proches du restaurant.
 * 
 * Règle 4 : Notification automatique des chauffeurs disponibles.
 * Le code de récupération est inclus dans la notification.
 */
export const onFoodOrderPaymentValidated = onDocumentUpdated(
  { document: 'food_orders/{orderId}', region: 'europe-west1', secrets: [stripeSecretKey] },
  async (event) => {
    if (!event.data) return
    const before = event.data.before.data()
    const after  = event.data.after.data()
    if (!before || !after) return

    // Ne déclencher QUE quand paymentValidated passe de false → true
    if (before.paymentValidated || !after.paymentValidated) return

    const orderId = event.params.orderId
    const restaurantId = after.restaurantId

    // 1. Générer orderNumber via compteur atomique par restaurant + lire les infos restaurant
    const restaurantRef = admin.firestore().collection('restaurants').doc(restaurantId)
    let restaurantData: FirebaseFirestore.DocumentData | undefined
    const orderNumber = await admin.firestore().runTransaction(async (tx) => {
      const restaurantDoc = await tx.get(restaurantRef)
      restaurantData = restaurantDoc.data()
      const counter = (restaurantData?.orderCounter || 0) + 1
      tx.update(restaurantRef, { orderCounter: counter })
      return `#${counter}`
    })

    // 2. Générer pinCode si nécessaire
    const deliveryPreference = after.deliveryPreference as string | undefined
    const pinCode = (deliveryPreference === 'meet_outside' || deliveryPreference === 'meet_at_door')
      ? crypto.randomInt(1000, 9999).toString()
      : null

    // 4. Enrichir food_orders avec les champs requis
    const updates: Record<string, unknown> = {
      orderNumber,
      cityId: after.cityId || restaurantData?.cityId || 'edmonton',
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (pinCode != null) updates.pinCode = pinCode
    if (!after.restaurantAddress && restaurantData) {
      const lat = restaurantData.location?.lat
      const lng = restaurantData.location?.lng
      if (lat == null || lng == null) {
        console.warn(`[FoodOrderPaymentValidated] Restaurant ${restaurantId} sans coordonnées, commande ${orderId}`)
      }
      updates.restaurantAddress = {
        address: restaurantData.address,
        lat: lat ?? 0,
        lng: lng ?? 0,
      }
    }
    if (!after.restaurantPhone && restaurantData) {
      updates.restaurantPhone = restaurantData.phone
    }
    if (!after.restaurantName && restaurantData) {
      updates.restaurantName = restaurantData.name
    }

    await admin.firestore().collection('food_orders').doc(orderId).update(updates)

    await settleRestaurantForFoodOrder(
      orderId,
      { ...after, ...updates },
      createStripeClient(stripeSecretKey.value()),
    )
  }
)

// ============================================================================
// Livraison de Repas — Notification Client (Statut Commande)
// ============================================================================

/**
 * Cloud Function: onFoodOrderStatusChanged
 * 
 * Déclenchée quand le statut d'une commande de livraison est mis à jour.
 * Notifie le client pour le tenir informé en temps réel.
 */
export const onFoodOrderStatusChanged = onDocumentUpdated('food_orders/{orderId}', async (event) => {
  const oldData = event.data?.before.data();
  const newData = event.data?.after.data();

  if (!oldData || !newData) {
    console.log('[FoodOrderUpdate] Données manquantes, ignorance de l\'événement.');
    return;
  }

  // Ne déclencher que si le statut a réellement changé
  if (oldData.status === newData.status) {
    return;
  }

  const clientId = newData.userId;
  const newStatus = newData.status;
  const restaurantName = newData.restaurantName || 'Le restaurant';

  try {
    // 1. Récupérer le token FCM du client
    const userDoc = await admin.firestore().collection('users').doc(clientId).get();
    
    if (!userDoc.exists) {
      console.log(`[FoodOrderUpdate] Utilisateur ${clientId} introuvable.`);
      return;
    }

    const userData = userDoc.data();
    const fcmToken = userData?.fcmToken;

    if (!fcmToken) {
      console.log(`[FoodOrderUpdate] Pas de token FCM pour le client ${clientId}.`);
      return;
    }

    // 2. Préparer le message selon le nouveau statut
    let title = 'Mise à jour de votre commande';
    let body = `Votre commande chez ${restaurantName} a été mise à jour.`;

    switch (newStatus) {
      case 'confirmed':
        title = 'Commande confirmée ! ';
        body = `${restaurantName} a accepté votre commande et va bientôt la préparer.`;
        break;
      case 'preparing':
        title = 'Préparation en cours 🍳';
        body = `Votre repas est en cours de préparation chez ${restaurantName}.`;
        break;
      case 'ready':
        title = 'Commande prête ! 🛍️';
        body = `Votre commande est prête à être récupérée par le livreur.`;
        break;
      case 'picked_up':
        title = 'En route vers vous ! 🛵';
        body = `Le livreur a récupéré votre commande et est en route !`;
        break;
      case 'delivering':
        title = 'Livraison imminente 📍';
        body = `Le livreur est presque arrivé avec votre commande.`;
        break;
      case 'delivered':
        title = 'Bon appétit ! 🍽️';
        body = `Votre commande a été livrée. N'hésitez pas à laisser un avis !`;
        break;
      case 'cancelled':
        title = 'Commande annulée ❌';
        body = `Votre commande chez ${restaurantName} a été annulée.`;
        break;
      default:
        // On ne notifie pas pour 'pending' car c'est le statut initial
        if (newStatus === 'pending') return;
        break;
    }

    const message = {
      notification: {
        title,
        body,
      },
      data: {
        type: 'food_order_update',
        orderId: event.params.orderId,
        status: newStatus,
        click_action: 'FOOD_ORDER_UPDATE',
      },
      token: fcmToken,
    };

    // 3. Envoyer la notification
    const response = await admin.messaging().send(message);
    console.log(`[FoodOrderUpdate] Notification envoyée au client ${clientId} pour commande ${event.params.orderId}. ID: ${response}`);

    // Persister dans Firestore pour la cloche de notifications
    await createNotification({
      userId: clientId,
      title,
      body,
      type: 'food_order_update',
      metadata: { orderId: event.params.orderId, status: newStatus },
    });

  } catch (error: unknown) {
    const errorCode = (error as { code?: string })?.code;
    if (errorCode === 'messaging/invalid-registration-token' || errorCode === 'messaging/registration-token-not-registered') {
      console.log(`[FoodOrderUpdate] Token invalide pour le client ${clientId}. Nettoyage.`);
      // Nettoyage: retirer le token du doc user
      try {
        await admin.firestore().collection('users').doc(clientId).update({ fcmToken: FieldValue.delete() });
      } catch { /* ignore */ }
    } else {
      console.error(`[FoodOrderUpdate] Erreur envoi notification:`, error);
    }
  }
});

// ============================================================================
// Task 6 — onFoodOrderAccepted
// ============================================================================

export const onFoodOrderAccepted = onDocumentUpdated(
  { document: 'food_orders/{orderId}', region: 'europe-west1' },
  async (event) => {
    if (!event.data) return
    const before = event.data.before.data()
    const after  = event.data.after.data()
    if (!before || !after) return

    // Se déclencher UNIQUEMENT quand status passe de 'confirmed' à 'accepted'
    if (before.status === 'accepted' || after.status !== 'accepted') return

    const orderId = event.params.orderId
    const db = admin.firestore()
    const rtdb = getDatabase()

    // 1. Trouver les livreurs disponibles dans la même ville
    const candidates = await db.collection('drivers')
      .where('cityId', '==', after.cityId || 'edmonton')
      .where('isAvailable', '==', true)
      .where('status', '==', 'approved')
      .where('driverType', 'in', ['livreur', 'les_deux'])
      .limit(20)
      .get()

    const activeCandidates = candidates.docs.filter(doc => {
      const d = doc.data()
      if (d.driverType === 'les_deux' && d.activeMode !== 'livraison') return false
      if (d.activeDeliveryOrderId != null) return false
      return true
    })

    // 2. Lire les positions RTDB
    const locationSnaps = await Promise.all(
      activeCandidates.map(doc => rtdb.ref(`driver_locations/${doc.id}`).get())
    )
    const candidatesWithLocation = activeCandidates
      .map((doc, i) => ({
        id: doc.id,
        data: doc.data(),
        loc: locationSnaps[i].val() as { lat: number; lng: number } | null,
      }))
      .filter((c): c is { id: string; data: FirebaseFirestore.DocumentData; loc: { lat: number; lng: number } } => c.loc != null)

    // 3. Sélectionner le livreur le plus proche
    if (!after.restaurantAddress || after.restaurantAddress.lat == null || after.restaurantAddress.lng == null) {
      console.warn(`[FoodOrderAccepted] Commande ${orderId} sans restaurantAddress valide, impossible d'assigner un livreur.`)
      await db.collection('food_orders').doc(orderId).update({
        status: 'no_driver_available',
        updatedAt: FieldValue.serverTimestamp(),
      })
      await setActiveDeliveryOrderClaim(after.userId, null)
      return
    }
    let remainingCandidates = candidatesWithLocation
    let nearest = selectNearestDriver(remainingCandidates, after.restaurantAddress)

    // 4. Aucun livreur disponible
    if (!nearest) {
      await db.collection('food_orders').doc(orderId).update({
        status: 'no_driver_available',
        updatedAt: FieldValue.serverTimestamp(),
      })
      await setActiveDeliveryOrderClaim(after.userId, null)
      return
    }

    // 5. Créer food_delivery_orders + marquer le driver comme occupé (transaction)
    let assignedCandidate: DriverCandidate | null = null
    while (nearest && !assignedCandidate) {
      const candidate = nearest
      const result = await db.runTransaction(async (transaction): Promise<'assigned' | 'retry' | 'stale'> => {
      const foodOrderRef = db.collection('food_orders').doc(orderId)
      const deliveryOrderRef = db.collection('food_delivery_orders').doc(orderId)
      const driverRef = db.collection('drivers').doc(candidate.id)
      const [currentOrderSnap, deliveryOrderSnap, driverSnap] = await Promise.all([
        transaction.get(foodOrderRef),
        transaction.get(deliveryOrderRef),
        transaction.get(driverRef),
      ])
      const currentOrder = currentOrderSnap.data()
      const currentDriver = driverSnap.data()
      if (shouldSkipStaleDeliveryAssignment(currentOrder, deliveryOrderSnap.exists)) return 'stale'
      if (currentDriver?.activeDeliveryOrderId != null) {
        return 'retry'
      }

      transaction.set(deliveryOrderRef, {
        ...buildAssignedFoodDeliveryOrderData({
          orderId,
          driverId: candidate.id,
          source: {
            restaurantId: currentOrder?.restaurantId ?? after.restaurantId,
            userId: currentOrder?.userId ?? after.userId,
            cityId: currentOrder?.cityId || after.cityId || 'edmonton',
            deliveryPreference: currentOrder?.deliveryPreference ?? after.deliveryPreference ?? 'leave_at_door',
            restaurantAddress: currentOrder?.restaurantAddress ?? after.restaurantAddress,
            clientNeighbourhood: currentOrder?.clientNeighbourhood ?? after.clientNeighbourhood ?? '',
            orderItems: currentOrder?.orderItems ?? after.orderItems ?? [],
            orderNumber: currentOrder?.orderNumber ?? after.orderNumber ?? '',
            restaurantName: currentOrder?.restaurantName ?? after.restaurantName ?? '',
            restaurantPhone: currentOrder?.restaurantPhone ?? after.restaurantPhone ?? '',
            customerPhone: currentOrder?.customerPhone ?? after.customerPhone ?? '',
            totalOrderPrice: currentOrder?.totalOrderPrice ?? after.totalOrderPrice ?? 0,
            deliveryCost: currentOrder?.deliveryCost ?? after.deliveryCost ?? 0,
          },
          assignmentAttempt: 1,
          deliveryShareRate: DELIVERY_SHARE_RATE,
        }),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(driverRef, {
        activeDeliveryOrderId: orderId,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(foodOrderRef, {
        driverId: candidate.id,
        driverName: `${candidate.data.firstName ?? ''} ${candidate.data.lastName ?? ''}`.trim() || candidate.data.displayName || 'Livreur',
        driverPhone: candidate.data.phone ?? '',
        deliveryAssignmentAttempt: 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return 'assigned'
    });
      if (result === 'assigned') {
        assignedCandidate = candidate
      } else if (result === 'retry') {
        remainingCandidates = remainingCandidates.filter((candidate) => candidate.id !== nearest?.id)
        nearest = selectNearestDriver(remainingCandidates, after.restaurantAddress)
      } else {
        break
      }
    }

    if (!assignedCandidate) {
      const orderRef = db.collection('food_orders').doc(orderId)
      await db.runTransaction(async (transaction) => {
        const currentOrderSnap = await transaction.get(orderRef)
        if (isFoodOrderAssignableToDriver(currentOrderSnap.data())) {
          transaction.update(orderRef, {
            status: 'no_driver_available',
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
      })
      await setActiveDeliveryOrderClaim(after.userId, null)
      return
    }

    await setDeliveryTrackingAccess(orderId, assignedCandidate.id, [assignedCandidate.id, after.userId])

    // 7. Émettre custom claim conservé pour compatibilité des clients déjà connectés
    await Promise.all([
      setActiveDeliveryOrderClaim(assignedCandidate.id, orderId),
      setActiveDeliveryOrderClaim(after.userId, orderId),
    ])

    // 8. Notification FCM au livreur
    const driverSnap = await db.collection('drivers').doc(assignedCandidate.id).get()
    const fcmToken = driverSnap.data()?.fcmToken
    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: 'Nouvelle commande',
          body: `${after.restaurantName ?? 'Restaurant'} — ${after.orderNumber ?? ''}`,
        },
        data: { type: 'delivery_order_new', orderId },
      })
    }

    // 9. Planifier timeout 90s via Cloud Tasks
    await scheduleDeliveryOrderTimeout(orderId, 1)
  }
)

// ============================================================================
// Task 7 — onDeliveryStatusChanged + onRestaurantCancelOrder
// ============================================================================

async function reassignFoodDeliveryOrderAfterDriverRefusal(
  orderId: string,
  deliveryOrder: FirebaseFirestore.DocumentData,
): Promise<void> {
  const db = admin.firestore()
  const rtdb = getDatabase()
  const currentDriverId = deliveryOrder.driverId as string | undefined
  const clientId = deliveryOrder.clientId as string | undefined
  const currentAttempt = Number(deliveryOrder.assignmentAttempt ?? 1)

  if (currentDriverId) {
    await db.collection('drivers').doc(currentDriverId).update({
      activeDeliveryOrderId: null,
      updatedAt: FieldValue.serverTimestamp(),
    })
    await setActiveDeliveryOrderClaim(currentDriverId, null)
  }

  const deliveryRef = db.collection('food_delivery_orders').doc(orderId)
  const foodOrderRef = db.collection('food_orders').doc(orderId)

  if (!canRetryDeliveryAssignment(currentAttempt)) {
    await db.runTransaction(async (tx) => {
      tx.update(foodOrderRef, {
        status: 'no_driver_available',
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.update(deliveryRef, {
        ...getDeliveryOrderCancellationAfterRefusal(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    })
    await setActiveDeliveryOrderClaim(clientId, null)
    return
  }

  const foodOrderSnap = await foodOrderRef.get()
  if (!foodOrderSnap.exists) {
    await deliveryRef.update({
      ...getDeliveryOrderCancellationAfterRefusal(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await setActiveDeliveryOrderClaim(clientId, null)
    return
  }
  const foodOrder = foodOrderSnap.data()!
  if (!['accepted', 'preparing', 'ready'].includes(String(foodOrder.status))) {
    await deliveryRef.update({
      ...getDeliveryOrderCancellationAfterRefusal(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await setActiveDeliveryOrderClaim(clientId, null)
    return
  }

  const candidates = await db.collection('drivers')
    .where('cityId', '==', foodOrder.cityId ?? deliveryOrder.cityId ?? 'edmonton')
    .where('isAvailable', '==', true)
    .where('status', '==', 'approved')
    .where('driverType', 'in', ['livreur', 'les_deux'])
    .limit(20)
    .get()

  const activeCandidates = candidates.docs.filter((doc) => {
    if (doc.id === currentDriverId) return false
    const d = doc.data()
    if (d.driverType === 'les_deux' && d.activeMode !== 'livraison') return false
    if (d.activeDeliveryOrderId != null) return false
    return true
  })

  const locationSnaps = await Promise.all(
    activeCandidates.map((doc) => rtdb.ref(`driver_locations/${doc.id}`).get()),
  )
  const candidatesWithLocation = activeCandidates
    .map((doc, i) => ({ id: doc.id, data: doc.data(), loc: locationSnaps[i].val() as { lat: number; lng: number } | null }))
    .filter((c): c is { id: string; data: FirebaseFirestore.DocumentData; loc: { lat: number; lng: number } } => c.loc != null)

  if (!foodOrder.restaurantAddress) {
    await db.runTransaction(async (tx) => {
      tx.update(foodOrderRef, {
        status: 'no_driver_available',
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.update(deliveryRef, {
        ...getDeliveryOrderCancellationAfterRefusal(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    })
    await setActiveDeliveryOrderClaim(clientId, null)
    return
  }

  const nextDriver = selectNearestDriver(candidatesWithLocation, foodOrder.restaurantAddress)
  if (!nextDriver) {
    await db.runTransaction(async (tx) => {
      tx.update(foodOrderRef, {
        status: 'no_driver_available',
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.update(deliveryRef, {
        ...getDeliveryOrderCancellationAfterRefusal(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    })
    await setActiveDeliveryOrderClaim(clientId, null)
    return
  }

  const nextAttempt = getNextDeliveryAssignmentAttempt(currentAttempt)
  const reassignmentResult = await db.runTransaction(async (tx): Promise<'reassigned' | 'not_reassigned'> => {
    const [latestFoodOrderSnap, latestDeliverySnap, nextDriverSnap] = await Promise.all([
      tx.get(foodOrderRef),
      tx.get(deliveryRef),
      tx.get(db.collection('drivers').doc(nextDriver.id)),
    ])
    const latestFoodOrder = latestFoodOrderSnap.data()
    const latestDeliveryOrder = latestDeliverySnap.data()
    const latestDriver = nextDriverSnap.data()
    if (!latestFoodOrderSnap.exists || !latestDeliverySnap.exists) return 'not_reassigned'
    if (!['accepted', 'preparing', 'ready'].includes(String(latestFoodOrder?.status))) {
      tx.update(deliveryRef, {
        ...getDeliveryOrderCancellationAfterRefusal(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      return 'not_reassigned'
    }
    if (latestDeliveryOrder?.status !== 'refused') return 'not_reassigned'
    if (latestDriver?.activeDeliveryOrderId != null) {
      tx.update(foodOrderRef, {
        status: 'no_driver_available',
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.update(deliveryRef, {
        ...getDeliveryOrderCancellationAfterRefusal(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      return 'not_reassigned'
    }

    tx.update(deliveryRef, {
      driverId: nextDriver.id,
      status: 'assigned',
      assignmentAttempt: nextAttempt,
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.update(foodOrderRef, {
      driverId: nextDriver.id,
      driverName: `${nextDriver.data.firstName ?? ''} ${nextDriver.data.lastName ?? ''}`.trim() || nextDriver.data.displayName || 'Livreur',
      driverPhone: nextDriver.data.phone ?? '',
      deliveryAssignmentAttempt: nextAttempt,
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.update(db.collection('drivers').doc(nextDriver.id), {
      activeDeliveryOrderId: orderId,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return 'reassigned'
  })
  if (reassignmentResult !== 'reassigned') {
    await setActiveDeliveryOrderClaim(clientId, null)
    return
  }
  await setDeliveryTrackingAccess(orderId, nextDriver.id, [nextDriver.id, clientId])
  await setActiveDeliveryOrderClaim(nextDriver.id, orderId)

  const fcmToken = typeof nextDriver.data.fcmToken === 'string' ? nextDriver.data.fcmToken : null
  if (fcmToken) {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title: 'Nouvelle commande', body: foodOrder.orderNumber ?? '' },
      data: { type: 'delivery_order_new', orderId },
    })
  }

  await scheduleDeliveryOrderTimeout(orderId, nextAttempt)
}

export const onDeliveryStatusChanged = onDocumentUpdated(
  { document: 'food_delivery_orders/{orderId}', region: 'europe-west1' },
  async (event) => {
    if (!event.data) return
    const before = event.data.before.data()
    const after  = event.data.after.data()
    if (!before || !after || before.status === after.status) return

    const db = admin.firestore()

    if (after.status === 'refused') {
      await reassignFoodDeliveryOrderAfterDriverRefusal(event.params.orderId, after)
      return
    }

    const foodOrderStatus = getFoodOrderStatusForDeliveryStatus(after.status)
    if (!foodOrderStatus) return

    await db.collection('food_orders').doc(event.params.orderId).update({
      status: foodOrderStatus,
      updatedAt: FieldValue.serverTimestamp(),
    })

    const sendClientNotif = async (title: string, body: string) => {
      const clientSnap = await db.collection('users').doc(after.clientId).get()
      const fcmToken = clientSnap.data()?.fcmToken
      if (fcmToken) {
        await admin.messaging().send({
          token: fcmToken,
          notification: { title, body },
          data: { type: 'delivery_order_update', orderId: event.params.orderId },
        })
      }
    }

    if (after.status === 'picked_up') {
      await sendClientNotif('Votre commande est en route !',
        `${after.restaurantName} — votre commande a été récupérée`)
    }
    if (after.status === 'delivered') {
      await sendClientNotif('Commande livrée', 'Votre commande est arrivée — notez votre livreur')
    }
  }
)

export const onRestaurantCancelOrder = onDocumentUpdated(
  { document: 'food_orders/{orderId}', region: 'europe-west1' },
  async (event) => {
    if (!event.data) return
    const before = event.data.before.data()
    const after  = event.data.after.data()
    if (!before || !after) return
    if (after.status !== 'cancelled_by_restaurant' || before.status === 'cancelled_by_restaurant') return

    const db = admin.firestore()
    const deliveryOrderSnap = await db.collection('food_delivery_orders').doc(event.params.orderId).get()
    if (!deliveryOrderSnap.exists) return

    const deliveryOrder = deliveryOrderSnap.data()!

    if (['picked_up', 'heading_to_client', 'arrived_client', 'delivered'].includes(deliveryOrder.status)) {
      await db.collection('audit_logs').add({
        type: 'restaurant_cancel_after_pickup',
        orderId: event.params.orderId,
        driverId: deliveryOrder.driverId,
        timestamp: FieldValue.serverTimestamp(),
      })
      return
    }

    await db.collection('food_delivery_orders').doc(event.params.orderId).update({
      status: 'cancelled',
      cancellationReason: 'restaurant_cancelled',
      cancellationImpactOnStats: false,
      updatedAt: FieldValue.serverTimestamp(),
    })

    await db.collection('drivers').doc(deliveryOrder.driverId).update({
      activeDeliveryOrderId: null,
      updatedAt: FieldValue.serverTimestamp(),
    })

    await Promise.all([
      setActiveDeliveryOrderClaim(deliveryOrder.driverId, null),
      setActiveDeliveryOrderClaim(deliveryOrder.clientId, null),
    ])

    const driverSnap = await db.collection('drivers').doc(deliveryOrder.driverId).get()
    const fcmToken = driverSnap.data()?.fcmToken
    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: 'Commande annulée',
          body: `Le restaurant a annulé la commande ${deliveryOrder.orderNumber}`,
        },
        data: { type: 'delivery_order_update', orderId: event.params.orderId },
      })
    }
  }
)

async function refundFoodOrderPayment(orderId: string, order: FirebaseFirestore.DocumentData): Promise<void> {
  if (order.paymentValidated !== true || order.paymentRefunded === true) return

  const db = admin.firestore()

  if (order.paymentMethod === 'wallet') {
    await reverseRestaurantFoodOrderTransfer(
      orderId,
      createStripeClient(stripeSecretKey.value()),
    )

    const originalTransactionId = order.paymentTransactionId
    if (!originalTransactionId) return

    const originalRef = db.collection('transactions').doc(originalTransactionId)
    const refundRef = db.collection('transactions').doc(`refund_${originalTransactionId}`)
    const walletRef = db.collection('wallets').doc(order.userId)
    const orderRef = db.collection('food_orders').doc(orderId)

    await db.runTransaction(async (tx) => {
      const [originalSnap, refundSnap, walletSnap, orderSnap] = await Promise.all([
        tx.get(originalRef),
        tx.get(refundRef),
        tx.get(walletRef),
        tx.get(orderRef),
      ])
      if (!originalSnap.exists || !walletSnap.exists || !orderSnap.exists) return
      if (refundSnap.exists || orderSnap.data()?.paymentRefunded === true) return

      const original = originalSnap.data()!
      const amount = Math.abs(original.amount ?? 0)
      if (!Number.isFinite(amount) || amount <= 0) return

      tx.set(refundRef, {
        id: refundRef.id,
        userId: order.userId,
        type: 'refund',
        amount,
        currency: original.currency ?? 'CAD',
        description: `Remboursement commande repas ${orderId}`,
        reference: originalTransactionId,
        foodOrderId: orderId,
        status: 'completed',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.update(walletRef, {
        balance: (walletSnap.data()?.balance ?? 0) + amount,
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.update(orderRef, {
        paymentRefunded: true,
        refundTransactionId: refundRef.id,
        refundedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    })
    return
  }

  if (order.paymentMethod === 'card' && order.stripePaymentIntentId) {
    const stripe = createStripeClient(stripeSecretKey.value())
    const settlementSnap = await db.collection('food_order_settlements').doc(orderId).get()
    const settlementVersion = settlementSnap.data()?.settlementVersion

    if (settlementVersion === 'food_split_v1') {
      await reverseRestaurantFoodOrderTransfer(orderId, stripe)
    }

    const refund = await stripe.refunds.create(
      {
        payment_intent: order.stripePaymentIntentId,
        reason: 'requested_by_customer',
        ...(settlementVersion === 'food_split_v1'
          ? {}
          : { reverse_transfer: true, refund_application_fee: true }),
        metadata: { purpose: 'food_order_refund', orderId },
      },
      { idempotencyKey: `food_refund_${orderId}_${order.stripePaymentIntentId}` },
    )

    await db.collection('food_orders').doc(orderId).update({
      paymentRefunded: true,
      stripeRefundId: refund.id,
      refundedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
}

export const onFoodOrderRefundRequired = onDocumentUpdated(
  { document: 'food_orders/{orderId}', region: 'europe-west1', secrets: [stripeSecretKey] },
  async (event) => {
    if (!event.data) return
    const before = event.data.before.data()
    const after = event.data.after.data()
    if (!before || !after || before.status === after.status) return
    if (!['cancelled', 'cancelled_by_restaurant', 'no_driver_available'].includes(after.status)) return
    await refundFoodOrderPayment(event.params.orderId, after)
  },
)

export const retryFailedFoodOrderSettlements = onSchedule(
  { schedule: 'every 15 minutes', region: 'europe-west1', secrets: [stripeSecretKey] },
  async () => {
    const db = admin.firestore()
    const failedSettlements = await db.collection('food_order_settlements')
      .where('restaurantStatus', 'in', ['failed', 'processing'])
      .limit(50)
      .get()

    for (const settlementDoc of failedSettlements.docs) {
      const orderId = settlementDoc.id
      const orderSnap = await db.collection('food_orders').doc(orderId).get()
      const order = orderSnap.data()
      if (!order || order.paymentValidated !== true || order.paymentRefunded === true) continue

      try {
        await settleRestaurantForFoodOrder(
          orderId,
          order,
          createStripeClient(stripeSecretKey.value()),
        )
      } catch (error) {
        console.error('[retryFailedFoodOrderSettlements] retry failed', {
          orderId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  },
)

export const cleanupAbandonedFoodPayments = onSchedule(
  { schedule: 'every 15 minutes', region: 'europe-west1' },
  async () => {
    const db = admin.firestore()
    const threshold = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 60 * 1000)
    const staleOrders = await db.collection('food_orders')
      .where('status', '==', 'pending_payment')
      .where('createdAt', '<=', threshold)
      .limit(100)
      .get()

    const batch = db.batch()
    let writeCount = 0
    staleOrders.docs.forEach((orderDoc) => {
      const order = orderDoc.data()
      if (!isFoodOrderPaymentExpired(order)) return
      batch.update(orderDoc.ref, {
        ...getStalePendingPaymentCancellationUpdate(),
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      writeCount += 1
    })
    if (writeCount > 0) await batch.commit()
  },
)

// ============================================================================
// Task 8 — onDeliveryOrderCompleted + onDeliveryOrderTimeout
// ============================================================================

export const onDeliveryOrderCompleted = onDocumentUpdated(
  { document: 'food_delivery_orders/{orderId}', region: 'europe-west1' },
  async (event) => {
    if (!event.data) return
    const before = event.data.before.data()
    const after  = event.data.after.data()
    if (!before || !after) return
    if (!['delivered', 'cancelled'].includes(after.status) || before.status === after.status) return

    const db = admin.firestore()
    const rtdb = getDatabase()
    const orderId = event.params.orderId
    const driverId = after.driverId

    const driverUpdate: Record<string, unknown> = {
      activeDeliveryOrderId: null,
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (after.status === 'delivered') {
      driverUpdate.deliveriesCompleted = FieldValue.increment(1)
      driverUpdate.deliveryEarnings = FieldValue.increment(after.driverEarnings ?? 0)
      driverUpdate.pendingBalanceCents = FieldValue.increment(
        Math.max(0, Math.round(Number(after.driverEarnings ?? 0) * 100)),
      )
      driverUpdate.currency = 'cad'
    }

    await db.collection('drivers').doc(driverId).update(driverUpdate)

    await Promise.all([
      setActiveDeliveryOrderClaim(driverId, null),
      setActiveDeliveryOrderClaim(after.clientId, null),
    ])

    await rtdb.ref(`delivery_tracking/${orderId}`).remove()
  }
)

export const onDeliveryOrderTimeout = onRequest(
  { region: 'europe-west1' },
  async (req, res) => {
    // ------------------------------------------------------------------
    // Vérification OIDC stricte du token émis par Cloud Tasks
    // ------------------------------------------------------------------
    const authHeader = (req.headers['authorization'] as string | undefined) ?? ''
    const match = authHeader.match(/^Bearer (.+)$/)
    if (!match) {
      console.warn('[onDeliveryOrderTimeout] Missing bearer token')
      res.status(401).send('Missing bearer token')
      return
    }
    const idToken = match[1]

    const region = process.env.FUNCTION_REGION ?? 'europe-west1'
    const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT
    if (!projectId) {
      console.error('[onDeliveryOrderTimeout] GCLOUD_PROJECT not defined')
      res.status(500).send('Server misconfigured')
      return
    }
    const expectedAudience = `https://${region}-${projectId}.cloudfunctions.net/onDeliveryOrderTimeout`
    const expectedServiceAccount = process.env.CLOUD_TASKS_SERVICE_ACCOUNT

    try {
      const oauthClient = await getOAuthClient();
      const ticket = await oauthClient.verifyIdToken({
        idToken,
        audience: expectedAudience,
      })
      const payload = ticket.getPayload()
      if (!payload || payload.iss !== 'https://accounts.google.com') {
        console.warn('[onDeliveryOrderTimeout] Invalid issuer', { iss: payload?.iss })
        res.status(401).send('Invalid issuer')
        return
      }
      // Défense en profondeur : si un SA est configuré, vérifier qu'il correspond
      if (expectedServiceAccount && payload.email !== expectedServiceAccount) {
        console.warn('[onDeliveryOrderTimeout] Unexpected caller service account', { email: payload.email })
        res.status(403).send('Unauthorized caller')
        return
      }
    } catch (e) {
      console.warn('[onDeliveryOrderTimeout] OIDC token verification failed', e)
      res.status(401).send('Invalid token')
      return
    }

    // Défense en profondeur : headers Cloud Tasks (forgeables, mais utiles en cas
    // de mauvaise configuration de route). Non bloquants si absents.
    const queueName = req.headers['x-cloudtasks-queuename'] as string | undefined
    if (queueName && queueName !== 'delivery-order-timeout') {
      console.warn('[onDeliveryOrderTimeout] Unexpected queue', { queueName })
      res.status(403).send('Unauthorized')
      return
    }

    const { orderId, attemptNumber } = req.body as { orderId: string; attemptNumber: number }
    const db = admin.firestore()
    const rtdb = getDatabase()

    const orderRef = db.collection('food_delivery_orders').doc(orderId)
    const orderSnap = await orderRef.get()
    if (!orderSnap.exists) { res.status(200).send('Order not found'); return }

    const order = orderSnap.data()!

    if (order.status !== 'assigned') { res.status(200).send('Already processed'); return }

    await db.collection('drivers').doc(order.driverId).update({
      activeDeliveryOrderId: null,
      updatedAt: FieldValue.serverTimestamp(),
    })
    await setActiveDeliveryOrderClaim(order.driverId, null)

    const foodOrderRef = db.collection('food_orders').doc(orderId)

    if (attemptNumber >= 3) {
      await db.runTransaction(async (tx) => {
        tx.update(foodOrderRef, {
          status: 'no_driver_available',
          updatedAt: FieldValue.serverTimestamp(),
        })
        tx.update(orderRef, {
          status: 'cancelled',
          cancellationReason: 'driver_cancelled',
          cancellationImpactOnStats: false,
          updatedAt: FieldValue.serverTimestamp(),
        })
      })
      await setActiveDeliveryOrderClaim(order.clientId, null)
      res.status(200).send('No driver available after 3 attempts')
      return
    }

    const foodOrderSnap = await foodOrderRef.get()
    if (!foodOrderSnap.exists) {
      await orderRef.update({
        status: 'cancelled',
        cancellationReason: 'food_order_missing',
        cancellationImpactOnStats: false,
        updatedAt: FieldValue.serverTimestamp(),
      })
      await setActiveDeliveryOrderClaim(order.clientId, null)
      res.status(200).send('Food order not found')
      return
    }
    const foodOrder = foodOrderSnap.data()!
    if (!['accepted', 'preparing', 'ready'].includes(String(foodOrder.status))) {
      await orderRef.update({
        status: 'cancelled',
        cancellationReason: 'food_order_not_assignable',
        cancellationImpactOnStats: false,
        updatedAt: FieldValue.serverTimestamp(),
      })
      await setActiveDeliveryOrderClaim(order.clientId, null)
      res.status(200).send('Food order not assignable')
      return
    }

    const candidates = await db.collection('drivers')
      .where('cityId', '==', foodOrder.cityId)
      .where('isAvailable', '==', true)
      .where('status', '==', 'approved')
      .where('driverType', 'in', ['livreur', 'les_deux'])
      .limit(20)
      .get()

    const activeCandidates = candidates.docs.filter(doc => {
      if (doc.id === order.driverId) return false
      const d = doc.data()
      if (d.driverType === 'les_deux' && d.activeMode !== 'livraison') return false
      if (d.activeDeliveryOrderId != null) return false
      return true
    })

    const locationSnaps = await Promise.all(
      activeCandidates.map(doc => rtdb.ref(`driver_locations/${doc.id}`).get())
    )
    const candidatesWithLocation = activeCandidates
      .map((doc, i) => ({ id: doc.id, data: doc.data(), loc: locationSnaps[i].val() as { lat: number; lng: number } | null }))
      .filter((c): c is { id: string; data: FirebaseFirestore.DocumentData; loc: { lat: number; lng: number } } => c.loc != null)

    const nextDriver = selectNearestDriver(candidatesWithLocation, foodOrder.restaurantAddress)

    if (!nextDriver) {
      await db.runTransaction(async (tx) => {
        tx.update(foodOrderRef, { status: 'no_driver_available', updatedAt: FieldValue.serverTimestamp() })
        tx.update(orderRef, { status: 'cancelled', cancellationReason: 'driver_cancelled', cancellationImpactOnStats: false, updatedAt: FieldValue.serverTimestamp() })
      })
      await setActiveDeliveryOrderClaim(order.clientId, null)
      res.status(200).send('No candidate found')
      return
    }

    const reassignmentResult = await db.runTransaction(async (tx): Promise<'reassigned' | 'not_reassigned'> => {
      const [latestOrderSnap, latestFoodOrderSnap, nextDriverSnap] = await Promise.all([
        tx.get(orderRef),
        tx.get(foodOrderRef),
        tx.get(db.collection('drivers').doc(nextDriver.id)),
      ])
      const latestOrder = latestOrderSnap.data()
      const latestFoodOrder = latestFoodOrderSnap.data()
      const latestDriver = nextDriverSnap.data()
      if (latestOrder?.status !== 'assigned') return 'not_reassigned'
      if (!['accepted', 'preparing', 'ready'].includes(String(latestFoodOrder?.status))) {
        tx.update(orderRef, { status: 'cancelled', cancellationReason: 'food_order_not_assignable', cancellationImpactOnStats: false, updatedAt: FieldValue.serverTimestamp() })
        return 'not_reassigned'
      }
      if (latestDriver?.activeDeliveryOrderId != null) {
        tx.update(foodOrderRef, { status: 'no_driver_available', updatedAt: FieldValue.serverTimestamp() })
        tx.update(orderRef, { status: 'cancelled', cancellationReason: 'driver_cancelled', cancellationImpactOnStats: false, updatedAt: FieldValue.serverTimestamp() })
        return 'not_reassigned'
      }
      tx.update(orderRef, {
        driverId: nextDriver.id,
        status: 'assigned',
        assignmentAttempt: attemptNumber + 1,
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.update(foodOrderRef, {
        driverId: nextDriver.id,
        driverName: `${nextDriver.data.firstName ?? ''} ${nextDriver.data.lastName ?? ''}`.trim() || nextDriver.data.displayName || 'Livreur',
        driverPhone: nextDriver.data.phone ?? '',
        deliveryAssignmentAttempt: attemptNumber + 1,
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.update(db.collection('drivers').doc(nextDriver.id), { activeDeliveryOrderId: orderId, updatedAt: FieldValue.serverTimestamp() })
      return 'reassigned'
    })
    if (reassignmentResult !== 'reassigned') {
      await setActiveDeliveryOrderClaim(order.clientId, null)
      res.status(200).send('Order no longer assignable')
      return
    }
    await setDeliveryTrackingAccess(orderId, nextDriver.id, [nextDriver.id, order.clientId])
    await setActiveDeliveryOrderClaim(nextDriver.id, orderId)

    const driverSnap = await db.collection('drivers').doc(nextDriver.id).get()
    const fcmToken = driverSnap.data()?.fcmToken
    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: { title: 'Nouvelle commande', body: foodOrder.orderNumber ?? '' },
        data: { type: 'delivery_order_new', orderId },
      })
    }

    await scheduleDeliveryOrderTimeout(orderId, attemptNumber + 1)

    res.status(200).send(`Reassigned to ${nextDriver.id}, attempt ${attemptNumber + 1}`)
  }
)

// ============================================================================
// Task 9 — onDriverRatingCreated + logPinFailure
// ============================================================================

export const onDriverRatingCreated = onDocumentCreated(
  { document: 'driver_ratings/{ratingId}', region: 'europe-west1' },
  async (event) => {
    const rating = event.data?.data()
    if (!rating) return

    const db = admin.firestore()
    const driverRef = db.collection('drivers').doc(rating.driverId)

    await db.runTransaction(async (tx) => {
      const driverDoc = await tx.get(driverRef)
      const driverData = driverDoc.data()
      if (!driverData) return

      const currentCount = driverData.ratingsCount ?? 0
      const currentRating = driverData.rating ?? 0
      const newCount = currentCount + 1
      const newRating = ((currentRating * currentCount) + rating.score) / newCount

      tx.update(driverRef, {
        rating:       newRating,
        ratingsCount: newCount,
        updatedAt:    FieldValue.serverTimestamp(),
      })
    })
  }
)

export const onRestaurantReviewCreated = onDocumentCreated(
  { document: 'restaurant_reviews/{reviewId}', region: 'europe-west1' },
  async (event) => {
    const review = event.data?.data()
    if (!review) return
    const rating = Number(review.rating)
    if (!review.restaurantId || !Number.isFinite(rating) || rating < 1 || rating > 5) return

    const db = admin.firestore()
    const restaurantRef = db.collection('restaurants').doc(review.restaurantId)
    await db.runTransaction(async (tx) => {
      const restaurantSnap = await tx.get(restaurantRef)
      const restaurant = restaurantSnap.data()
      if (!restaurant) return
      const currentCount = Number(restaurant.totalReviews ?? 0)
      const currentRating = Number(restaurant.rating ?? 0)
      const newCount = currentCount + 1
      const newRating = ((currentRating * currentCount) + rating) / newCount
      tx.update(restaurantRef, {
        rating: Math.round(newRating * 10) / 10,
        totalReviews: newCount,
        updatedAt: FieldValue.serverTimestamp(),
      })
    })
  },
)

export const onDeliveryReviewCreated = onDocumentCreated(
  { document: 'delivery_reviews/{reviewId}', region: 'europe-west1' },
  async (event) => {
    const review = event.data?.data()
    if (!review) return
    const rating = Number(review.rating)
    if (!review.driverId || !Number.isFinite(rating) || rating < 1 || rating > 5) return

    const db = admin.firestore()
    const driverRef = db.collection('drivers').doc(review.driverId)
    await db.runTransaction(async (tx) => {
      const driverSnap = await tx.get(driverRef)
      const driver = driverSnap.data()
      if (!driver) return
      const currentCount = Number(driver.ratingsCount ?? 0)
      const currentRating = Number(driver.rating ?? 0)
      const newCount = currentCount + 1
      const newRating = ((currentRating * currentCount) + rating) / newCount
      tx.update(driverRef, {
        rating: Math.round(newRating * 10) / 10,
        ratingsCount: newCount,
        updatedAt: FieldValue.serverTimestamp(),
      })
    })
  },
)

const PIN_FAILURE_MAX_ATTEMPTS = 5;
const PIN_FAILURE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export const logPinFailure = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Vous devez être connecté.')

    const pinFailureSchema = z.object({
      orderId: z.string().min(1),
      clientPhone: z.string().min(1)
    });
    const { orderId, clientPhone } = pinFailureSchema.parse(request.data);

    // Rate limiting persistant via Firestore (résiste aux cold starts et multi-instances)
    const db = admin.firestore()
    const rateLimitRef = db.collection('pin_failure_rate_limits').doc(uid)
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(rateLimitRef)
      const data = snap.data()
      const now = Date.now()

      if (data && now < data.resetAt) {
        if (data.count >= PIN_FAILURE_MAX_ATTEMPTS) {
          throw new HttpsError('resource-exhausted', 'Trop de tentatives. Réessayez plus tard.')
        }
        tx.update(rateLimitRef, { count: FieldValue.increment(1) })
      } else {
        tx.set(rateLimitRef, { count: 1, resetAt: now + PIN_FAILURE_WINDOW_MS })
      }
    })

    await db.collection('audit_logs').add({
      type: 'delivery_pin_failed',
      orderId,
      driverId: uid,
      clientPhone,
      timestamp: FieldValue.serverTimestamp(),
    })

    return { success: true }
  }
)

export const validateDeliveryPinAndComplete = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Vous devez être connecté.')

    const schema = z.object({
      orderId: z.string().min(1),
      pin: z.string().regex(/^\d{4}$/),
    })
    const { orderId, pin } = schema.parse(request.data)

    const db = admin.firestore()
    const deliveryRef = db.collection('food_delivery_orders').doc(orderId)
    const foodOrderRef = db.collection('food_orders').doc(orderId)

    await db.runTransaction(async (tx) => {
      const [deliverySnap, foodOrderSnap] = await Promise.all([
        tx.get(deliveryRef),
        tx.get(foodOrderRef),
      ])
      if (!deliverySnap.exists || !foodOrderSnap.exists) {
        throw new HttpsError('not-found', 'Commande introuvable.')
      }

      const deliveryOrder = deliverySnap.data()!
      const foodOrder = foodOrderSnap.data()!

      if (deliveryOrder.driverId !== uid) {
        throw new HttpsError('permission-denied', 'Non autorisé.')
      }
      if (deliveryOrder.status !== 'arrived_client') {
        throw new HttpsError('failed-precondition', 'La commande doit être arrivée chez le client.')
      }
      if (!['meet_outside', 'meet_at_door'].includes(deliveryOrder.deliveryPreference)) {
        throw new HttpsError('failed-precondition', 'Cette commande ne nécessite pas de PIN.')
      }
      if (foodOrder.pinCode !== pin) {
        throw new HttpsError('permission-denied', 'Code PIN incorrect.')
      }

      tx.update(deliveryRef, {
        status: 'delivered',
        deliveredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    })

    return { success: true }
  }
)

export const validateFoodPickupCodeAndMarkPickedUp = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Vous devez être connecté.')

    const schema = z.object({
      orderId: z.string().min(1),
      pickupCode: z.string().trim().min(4).max(12),
    })
    const { orderId, pickupCode } = schema.parse(request.data)

    const db = admin.firestore()
    const deliveryRef = db.collection('food_delivery_orders').doc(orderId)
    const foodOrderRef = db.collection('food_orders').doc(orderId)

    await db.runTransaction(async (tx) => {
      const [deliverySnap, foodOrderSnap] = await Promise.all([
        tx.get(deliveryRef),
        tx.get(foodOrderRef),
      ])
      if (!deliverySnap.exists || !foodOrderSnap.exists) {
        throw new HttpsError('not-found', 'Commande introuvable.')
      }

      const deliveryOrder = deliverySnap.data()!
      const foodOrder = foodOrderSnap.data()!
      if (deliveryOrder.driverId !== uid) {
        throw new HttpsError('permission-denied', 'Non autorisé.')
      }
      if (deliveryOrder.status !== 'waiting') {
        throw new HttpsError('failed-precondition', 'La commande doit être en attente au restaurant.')
      }
      if (String(foodOrder.pickupCode ?? '').toUpperCase() !== pickupCode.toUpperCase()) {
        throw new HttpsError('permission-denied', 'Code de récupération incorrect.')
      }

      tx.update(deliveryRef, {
        status: 'picked_up',
        clientAddress: buildPickedUpClientAddress(foodOrder),
        pickedUpAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    })

    return { success: true }
  }
)

/**
 * Cloud Function de sécurité sur le champ `documents`.
 *
 * RGPD #C2 : Les documents KYC vivent dans la sous-collection
 * `drivers/{uid}/private/personal` (et non plus à la racine du doc driver).
 *
 * Empêche les transitions invalides de statut de documents:
 * - rejected → approved : INTERDIT (nécessite nouveau téléchargement)
 * - rejected → pending : AUTORISÉ (re-upload après rejet)
 * - pending -> approved : VERIFIE via approvedBy (admin only, #C3)
 * - approved → rejected : AUTORISÉ (audit admin)
 * - approved → pending : INTERDIT
 *
 * Sécurité #C3 : si `approvedBy` change, vérifier que l'UID correspond
 * à un admin existant dans `admins/{uid}`. Sinon rollback + incident.
 *
 * En cas de transition invalide, rollback vers l'état précédent.
 */
export const onDriverDocumentsUpdated = onDocumentUpdated(
  { document: 'drivers/{uid}/private/{docId}', region: 'europe-west1' },
  async (event) => {
    if (!event.data) return
    // Ne traiter que le document `personal` (où vivent les documents KYC)
    if (event.params.docId !== 'personal') return

    const before = event.data.before.data()
    const after = event.data.after.data()
    if (!before || !after) return

    const beforeDocs = before.documents as Record<string, { status: string; approvedBy?: string; url?: string | null; [key: string]: unknown }> | undefined
    const afterDocs = after.documents as Record<string, { status: string; approvedBy?: string; url?: string | null; [key: string]: unknown }> | undefined

    if (!beforeDocs || !afterDocs) return

    const invalidTransitions: Array<{
      docKey: string
      from: string
      to: string
      rollbackValue: { status: string; approvedBy?: string; url?: string | null; [key: string]: unknown }
      reason?: string
    }> = []

    // Cache des vérifications admin (évite lectures répétées)
    const adminExistsCache = new Map<string, boolean>()
    const isRealAdmin = async (uid: string): Promise<boolean> => {
      if (adminExistsCache.has(uid)) return adminExistsCache.get(uid)!
      const snap = await admin.firestore().collection('admins').doc(uid).get()
      const exists = snap.exists
      adminExistsCache.set(uid, exists)
      return exists
    }

    for (const [docKey, beforeEntry] of Object.entries(beforeDocs)) {
      const afterEntry = afterDocs[docKey]
      if (!afterEntry) continue

      const fromStatus = beforeEntry.status
      const toStatus = afterEntry.status

      // #C3 : si `approvedBy` change, vérifier que l'UID est un vrai admin
      if (afterEntry.approvedBy && afterEntry.approvedBy !== beforeEntry.approvedBy) {
        const approvedBy = String(afterEntry.approvedBy)
        const ok = await isRealAdmin(approvedBy)
        if (!ok) {
          invalidTransitions.push({
            docKey,
            from: fromStatus,
            to: toStatus,
            rollbackValue: beforeEntry,
            reason: `approvedBy '${approvedBy}' is not a registered admin`,
          })
          continue
        }
      }

      // rejected → approved : INTERDIT
      if (fromStatus === 'rejected' && toStatus === 'approved') {
        invalidTransitions.push({ docKey, from: fromStatus, to: toStatus, rollbackValue: beforeEntry })
      }
      // pending -> approved : securise via le champ approvedBy (renseigne par l'API route admin)
      else if (fromStatus === 'pending' && toStatus === 'approved') {
        if (!afterEntry.approvedBy) {
          invalidTransitions.push({ docKey, from: fromStatus, to: toStatus, rollbackValue: beforeEntry })
        }
      }
      // approved → pending : INTERDIT
      else if (fromStatus === 'approved' && toStatus === 'pending') {
        invalidTransitions.push({ docKey, from: fromStatus, to: toStatus, rollbackValue: beforeEntry })
      }
    }

    if (invalidTransitions.length > 0) {
      const rollbackUpdates: Record<string, unknown> = {}
      for (const { docKey, rollbackValue } of invalidTransitions) {
        rollbackUpdates[`documents.${docKey}`] = rollbackValue
      }

      await admin
        .firestore()
        .collection('drivers')
        .doc(event.params.uid)
        .collection('private')
        .doc('personal')
        .update(rollbackUpdates)

      await admin.firestore().collection('audit_logs').add({
        type: 'driver_documents_invalid_transition',
        uid: event.params.uid,
        invalidTransitions,
        timestamp: FieldValue.serverTimestamp(),
      })

      console.warn('[onDriverDocumentsUpdated] Rollback triggered:', invalidTransitions)
    }
  }
)

// ============================================================================
// Push Notification Topic Management
// ============================================================================

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
  return ALLOWED_TOPIC_PATTERNS.some(pattern => pattern.test(topic));
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

  // Rate limit topic churn — 30 subscribe+unsubscribe ops/min per user is
  // generous for legitimate reconnects but blocks enumeration / spam.
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
  const errorMsg = operation === 'subscribe'
    ? 'Erreur lors de l\'abonnement au topic.'
    : 'Erreur lors du désabonnement du topic.';

  try {
    const response = operation === 'subscribe'
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

export const sendVerificationCode = onCall(
  { cors: true, secrets: [resendApiKey] },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    const uid = request.auth.uid;
    const tokenEmail = request.auth.token.email;

    // Rate limit: verification codes cost money (Resend) and are a common
    // spam/abuse vector. 5/hour is ample for a legitimate re-send flow.
    await enforceRateLimit({
      identifier: uid,
      bucket: 'email:sendVerificationCode',
      limit: 5,
      windowSec: 60 * 60,
    });

    const { email } = request.data as { email?: string };
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError('invalid-argument', 'Adresse email invalide.');
    }

    if (tokenEmail !== email) {
      throw new HttpsError('permission-denied', 'L\'email ne correspond pas à votre compte.');
    }

    const db = admin.firestore();
    const docRef = db.collection('emailVerificationCodes').doc(uid);
    const existing = await docRef.get();
    if (existing.exists) {
      const data = existing.data()!;
      const resendAt = data.resendAt?.toMillis?.() ?? 0;
      const secondsSinceLastSend = (Date.now() - resendAt) / 1000;
      if (secondsSinceLastSend < 60) {
        throw new HttpsError(
          'resource-exhausted',
          'Trop de tentatives. Réessayez dans quelques secondes.'
        );
      }
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const salt = crypto.randomBytes(16).toString('hex');
    const hashedCode = await new Promise<string>((resolve, reject) =>
      crypto.pbkdf2(code, salt, 100_000, 64, 'sha512', (err, key) =>
        err ? reject(err) : resolve(key.toString('hex'))
      )
    );

    // Envoyer l'email AVANT d'écrire en Firestore (évite de bloquer par le rate limit si Resend échoue)
    let messageId: string | undefined;
    try {
      const { sendVerificationCodeEmail } = await import('./email-service.js');
      const emailResult = await sendVerificationCodeEmail({
        to: email,
        code,
        uid,
        apiKey: resendApiKey.value(),
      });
      messageId = emailResult.messageId;
    } catch (err) {
      console.error('[sendVerificationCode] Erreur Resend:', err);
      throw new HttpsError('internal', 'Erreur lors de l\'envoi de l\'email. Réessayez.');
    }

    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
    await docRef.set({
      code: hashedCode,
      salt,
      email,
      expiresAt,
      attempts: 0,
      createdAt: now,
      resendAt: now,
    });

    if (messageId) {
      await db.collection('emailLogs').doc(messageId).set({
        messageId,
        status: 'sent',
        to: email,
        subject: 'Votre code de vérification Medjira',
        type: 'verification_code',
        uid,
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { success: true };
  }
);

export const verifyCode = onCall(
  { cors: true, secrets: [resendApiKey] },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    const uid = request.auth.uid;

    // Rate limit: brute-force guard on top of the per-code 3-attempts limit.
    // 20/hour per uid stops guessing a freshly-issued code across resends.
    await enforceRateLimit({
      identifier: uid,
      bucket: 'email:verifyCode',
      limit: 20,
      windowSec: 60 * 60,
    });

    const { code } = request.data as { code?: string };
    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      throw new HttpsError('invalid-argument', 'Le code doit contenir exactement 6 chiffres.');
    }

    const db = admin.firestore();
    const docRef = db.collection('emailVerificationCodes').doc(uid);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new HttpsError('not-found', 'Aucun code en attente. Demandez un nouveau code.');
    }

    const data = docSnap.data()!;

    const expiresAt: admin.firestore.Timestamp = data.expiresAt;
    if (expiresAt.toMillis() < Date.now()) {
      await docRef.delete();
      throw new HttpsError('deadline-exceeded', 'Code expiré. Demandez un nouveau code.');
    }

    const attempts: number = data.attempts ?? 0;
    if (attempts >= 3) {
      await docRef.delete();
      throw new HttpsError(
        'resource-exhausted',
        'Trop de tentatives. Demandez un nouveau code.'
      );
    }

    const salt: string = data.salt;
    const hashedSubmitted = await new Promise<string>((resolve, reject) =>
      crypto.pbkdf2(code, salt, 100_000, 64, 'sha512', (err, key) =>
        err ? reject(err) : resolve(key.toString('hex'))
      )
    );

    if (
      hashedSubmitted.length !== data.code.length ||
      !crypto.timingSafeEqual(Buffer.from(hashedSubmitted, 'hex'), Buffer.from(data.code, 'hex'))
    ) {
      const newAttempts = attempts + 1;
      if (newAttempts >= 3) {
        await docRef.delete();
        return {
          success: false,
          error: 'Code incorrect. Trop de tentatives. Demandez un nouveau code.',
          attemptsLeft: 0,
        };
      }
      await docRef.update({ attempts: FieldValue.increment(1) });
      return {
        success: false,
        error: 'Code incorrect.',
        attemptsLeft: 3 - newAttempts,
      };
    }

    await docRef.delete();

    await admin.auth().updateUser(uid, { emailVerified: true });

    try {
      await db.collection('drivers').doc(uid).update({
        emailVerified: true,
        emailVerifiedAt: admin.firestore.Timestamp.now(),
      });
    } catch {
      // Document drivers not created yet — Firebase Auth is source of truth
    }

    try {
      await db.collection('users').doc(uid).update({
        emailVerified: true,
        emailVerifiedAt: admin.firestore.Timestamp.now(),
      });
    } catch {
    }

    return { success: true };
  }
);

export { stripeWebhookInstant, stripeWebhookLight, createSetupIntent, createConnectAccount, createConnectOnboardLink, getStripeAccountStatus } from './stripe/index.js';
export { stripeConnectPayout } from './stripe/stripeConnectPayout.js';
export { stripePaymentIntent } from './stripe/stripePaymentIntent.js';
export { stripeWalletRecharge } from './stripe/stripeWalletRecharge.js';
export {
  createPersonalDriverSubscriptionPayment,
  renewPersonalDriverSubscriptionPayment,
  adminManagePersonalDriver,
  driverUpdatePersonalDriverTrip,
  chargePersonalDriverWaitTimeOverage,
  settlePersonalDriverWaitOverageOnPickup,
  clientManagePersonalDriver,
  expirePersonalDriverSubscriptions,
  checkPersonalDriverTripsDelay,
  onSpecialTripCreated,
} from './personalDriver/index.js';

// ============================================================================
// Migration Next.js → Cloud Functions onCall (groupes)
// ============================================================================

export {
  adminDeleteDriverComplete,
  adminManageCity,
  adminManageDriver,
  adminManageRestaurant,
  adminManageUser,
  adminSendEmail,
} from './admin/index.js';

export {
  authSendVerificationCode,
  authStartPhoneVerification,
  authVerifyCode,
  authVerifyPhoneCode,
} from './authApi/index.js';

export {
  adminCreateDriverInvitation,
  validateDriverInvitation,
  completeDriverInvitation,
} from './driver/driverInvitation.js';

export {
  walletGetBalance,
  walletEnsure,
  walletFailTransaction,
  walletPayBooking,
  walletPayFoodOrder,
  payFoodOrderWithCard,
  walletRefundTransaction,

} from './walletApi/index.js';


export {
  bookingsComplete,
  distanceCalculate,
  reverseGeocode,
  debugLog,
} from './utilsApi/index.js';

// RGPD Article 17 — Droit à l'oubli
export {
  requestAccountDeletion,
  adminForceAccountDeletion,
} from './gdpr/deleteAccount.js';

// Anonymisation des locations / suppression RTDB au delete Auth (déjà existants)
export {
  anonymizeDriverData,
  deleteDriverOnAccountDelete,
  scheduleTripDataAnonymization,
  processAnonymizationTasks,
} from './anonymizeDriverData.js';
export { resendWebhook } from './emails/resend-webhook.js';

// Notifications SMS Twilio pour les réservations « pour un tiers »
export {
  onTaxiBookingAccepted,
  onTaxiBookingDriverArrived,
} from './bookingNotifications/index.js';

// Livraison de colis : matching automatique + SMS au destinataire + confirmation & payout (70/30)
export {
  onParcelCreated,
  onParcelPaymentValidated,
  onParcelStatusChanged,
  createParcelOrder,
  finalizeParcelCardPayment,
  confirmParcelReceipt,
  autoConfirmDeliveredParcels,
} from './parcels/index.js';
