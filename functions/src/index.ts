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
import { BankDetailsSchema, EncryptionRequestSchema, CreateDriverProfileRequestSchema } from './validators/schemas.js';
import { z } from 'zod';
import { onDocumentWritten, onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { hasRequiredFields } from './utils/validation.js';
import * as crypto from 'crypto';
import { getDatabase } from 'firebase-admin/database';
import { DELIVERY_SHARE_RATE } from './config/stripe.js';
import { selectNearestDriver } from './utils/matching.js';
import { enforceRateLimit } from './utils/rateLimiter.js';

// Lazy imports pour éviter le timeout de déploiement (10s)
let _cloudTasksClient: any = null;
async function getCloudTasksClient() {
  if (!_cloudTasksClient) {
    const { CloudTasksClient } = await import('@google-cloud/tasks');
    _cloudTasksClient = new CloudTasksClient();
  }
  return _cloudTasksClient;
}

let _oauthClient: any = null;
async function getOAuthClient() {
  if (!_oauthClient) {
    const { OAuth2Client } = await import('google-auth-library');
    _oauthClient = new OAuth2Client();
  }
  return _oauthClient;
}

// Définir le secret de chiffrement depuis Firebase Secret Manager
const encryptionMasterKey = defineSecret('ENCRYPTION_MASTER_KEY');
// Définir le secret Resend pour l'envoi d'emails OTP
const resendApiKey = defineSecret('RESEND_API_KEY');

// Initialiser Firebase Admin (vérifier si déjà initialisé pour éviter les erreurs)
if (!admin.apps.length) {
  admin.initializeApp();
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
          count: admin.firestore.FieldValue.increment(1),
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
const driverCreationLimiter = new RateLimiter(5, 60 * 1000);

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

export const createDriverProfile = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté pour effectuer cette action.');
    }

    if (!request.auth.uid) {
      throw new HttpsError('unauthenticated', 'UID manquant. Vous devez être connecté.');
    }

    const identifier = request.auth.uid;
    const allowed = await driverCreationLimiter.check(identifier, 'driver_profile_create');
    if (!allowed) {
      throw new HttpsError('resource-exhausted', 'Trop de tentatives. Réessayez dans une minute.');
    }

    // Validation stricte de l'enveloppe via Zod (SEC-V01).
    // Le schéma `.strict()` rejette automatiquement toute clé inconnue,
    // y compris les champs RGPD #C2 interdits à la racine
    // (ssn/bank/dob/nationality/address/idNumber/documents).
    let payload;
    try {
      payload = CreateDriverProfileRequestSchema.parse(request.data);
    } catch (err) {
      if (err instanceof z.ZodError) {
        // Log détaillé côté serveur uniquement pour éviter de divulguer
        // la structure du schéma à un attaquant.
        console.warn('[createDriverProfile] Validation Zod échouée', {
          uid: request.auth.uid,
          issues: err.issues,
        });
        throw new HttpsError('invalid-argument', 'Données de profil chauffeur invalides.');
      }
      throw err;
    }

    if (request.auth.uid !== payload.driverId) {
      throw new HttpsError('permission-denied', 'UID mismatch.');
    }

    const authEmail = request.auth.token.email as string | undefined;
    const driverData = payload.driverData;

    if (authEmail && driverData.email !== authEmail) {
      throw new HttpsError('permission-denied', 'Email mismatch: L\'email fourni ne correspond pas à l\'email authentifié.');
    }

    if (driverData.phoneNumber != null) {
      throw new HttpsError('failed-precondition', 'phoneNumber doit être null.');
    }

    // ⚠️ CORRECTION : year < 2010 rejette les anciens véhicules (pas > 2010 !)
    if (
      (driverData.driverType === 'chauffeur' || driverData.driverType === 'les_deux') &&
      driverData.car?.year != null &&
      Number(driverData.car.year) < 2010
    ) {
      throw new HttpsError('failed-precondition', 'Véhicule trop ancien. Année minimale: 2010.')
    }

    // RGPD #C2 : dob/nationality/address/ssn/bank/documents ne sont plus
    // envoyés dans driverData (ils vivent dans drivers/{uid}/private/personal,
    // écrit côté client par l'utilisateur propriétaire via writeBatch).
    const requiredFields = ['firstName', 'lastName', 'phone']
    if (driverData.driverType === 'chauffeur' || driverData.driverType === 'les_deux') {
      requiredFields.push('car')
    }
    if (driverData.driverType === 'livreur' && driverData.vehicleType !== 'velo' && !driverData.deliveryVehicle) {
      throw new HttpsError('failed-precondition', 'Véhicule livreur manquant.')
    }

    if (!hasRequiredFields(driverData, requiredFields)) {
      throw new HttpsError('failed-precondition', 'Champs requis manquants.');
    }

    const driverRef = admin.firestore().collection('drivers').doc(payload.driverId);
    const now = admin.firestore.FieldValue.serverTimestamp();

    // Utiliser une transaction pour éviter les race conditions
    try {
      const result = await admin.firestore().runTransaction(async (transaction) => {
        const snapshot = await transaction.get(driverRef);
        const existingStatus = snapshot.exists ? (snapshot.data()?.status as string | undefined) : undefined;

        if (existingStatus && !['draft', 'action_required', 'rejected', 'pending'].includes(existingStatus)) {
          throw new HttpsError('failed-precondition', 'Compte déjà actif.');
        }

        const sanitizedData = {
          ...driverData,
          uid: payload.driverId,
          email: driverData.email,
          phoneNumber: null,
          userType: 'chauffeur',
          status: 'pending',
          updatedAt: now,
          driverType: driverData.driverType,
          cityId: driverData.cityId || 'edmonton',
          vehicleType: driverData.vehicleType ?? (driverData.driverType === 'chauffeur' ? 'voiture' : null),
          activeMode: driverData.driverType === 'les_deux' ? 'taxi' : null,
          activeDeliveryOrderId: null,
          deliveriesCompleted: 0,
          deliveryEarnings: 0,
          ratingsCount: 0,
        };

        if (snapshot.exists) {
          // Préserver les champs de rejet importants lors du merge
          const existingData = snapshot.data();
          if (!existingData) {
            // Si existingData est undefined, utiliser sanitizedData tel quel
            transaction.set(driverRef, sanitizedData, { merge: true });
            return { success: true, existed: true };
          }
          
          const rejectionFieldsToPreserve = [
            'rejectionReason',
            'rejectionDate',
            'rejectionDetails',
            'rejectionCount',
            'lastRejectionBy'
          ];
          
          const preservedFields = rejectionFieldsToPreserve.reduce((acc, field) => {
            if (field in existingData && existingData[field] !== null && existingData[field] !== undefined) {
              acc[field] = existingData[field];
            }
            return acc;
          }, {} as Record<string, unknown>);
          
          transaction.set(driverRef, {
            ...sanitizedData,
            ...preservedFields,
          }, { merge: true });
          
          return { success: true, existed: true };
        } else {
          transaction.set(driverRef, {
            ...sanitizedData,
            createdAt: now,
          });
          
          return { success: true, existed: false };
        }
      });
      
      return result;
    } catch (transactionError) {
      // Si l'erreur est déjà une HttpsError, la renvoyer telle quelle
      if (transactionError instanceof HttpsError) {
        throw transactionError;
      }
      // Sinon, envelopper l'erreur de transaction dans une HttpsError
      throw new HttpsError('internal', 'Erreur lors de la création du profil chauffeur.');
    }
  }
);

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
  async (_event) => {
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
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
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
// Ces fonctions gèrent les appels via Agora RTC pour la fonctionnalité d'appel
// entre passagers et chauffeurs.
export { createCall, answerCall, endCall, getCallToken, sendSystemMessage } from './voip/index.js';

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
  { document: 'food_orders/{orderId}', region: 'europe-west1' },
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        await admin.firestore().collection('users').doc(clientId).update({ fcmToken: admin.firestore.FieldValue.delete() });
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      return
    }
    const nearest = selectNearestDriver(candidatesWithLocation, after.restaurantAddress)

    // 4. Aucun livreur disponible
    if (!nearest) {
      await db.collection('food_orders').doc(orderId).update({
        status: 'no_driver_available',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      return
    }

    // 5. Créer food_delivery_orders + marquer le driver comme occupé (transaction)
    await db.runTransaction(async (transaction) => {
      transaction.set(db.collection('food_delivery_orders').doc(orderId), {
        orderId,
        driverId: nearest.id,
        restaurantId: after.restaurantId,
        clientId: after.userId,
        cityId: after.cityId || 'edmonton',
        status: 'assigned',
        deliveryPreference: after.deliveryPreference ?? 'leave_at_door',
        pinCode: after.pinCode ?? null,
        restaurantAddress: after.restaurantAddress,
        clientNeighbourhood: after.clientNeighbourhood ?? '',
        clientAddress: {
          address: after.deliveryAddress ?? '',
          lat: after.deliveryLocation?.lat ?? 0,
          lng: after.deliveryLocation?.lng ?? 0,
          instructions: after.deliveryInstructions ?? undefined,
        },
        orderItems: (after.orderItems ?? []).map((item: { itemName: string; itemQuantity: number; itemPrice: number }) => ({
          name: item.itemName,
          qty: item.itemQuantity,
          price: item.itemPrice,
        })),
        orderNumber: after.orderNumber ?? '',
        restaurantName: after.restaurantName ?? '',
        restaurantPhone: after.restaurantPhone ?? '',
        clientPhone: after.customerPhone ?? '',
        totalAmount: after.totalOrderPrice ?? 0,
        driverEarnings: (after.deliveryCost ?? 0) * DELIVERY_SHARE_RATE,
        cancellationImpactOnStats: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(db.collection('drivers').doc(nearest.id), {
        activeDeliveryOrderId: orderId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // 7. Émettre custom claim pour les règles RTDB (tracking)
    await admin.auth().setCustomUserClaims(nearest.id, { activeDeliveryOrderId: orderId })

    // 8. Notification FCM au livreur
    const driverSnap = await db.collection('drivers').doc(nearest.id).get()
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
    const cloudTasksClient = await getCloudTasksClient();
    const PROJECT_ID = process.env.GCLOUD_PROJECT ?? ''
    const LOCATION = 'europe-west1'
    const FUNCTION_URL = `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net`
    const queuePath = cloudTasksClient.queuePath(PROJECT_ID, LOCATION, 'delivery-order-timeout')
    await cloudTasksClient.createTask({
      parent: queuePath,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: `${FUNCTION_URL}/onDeliveryOrderTimeout`,
          oidcToken: {
            serviceAccountEmail: `${PROJECT_ID}@appspot.gserviceaccount.com`,
          },
          body: Buffer.from(JSON.stringify({ orderId, attemptNumber: 1 })).toString('base64'),
          headers: { 'Content-Type': 'application/json' },
        },
        scheduleTime: { seconds: Math.floor(Date.now() / 1000) + 90 },
      },
    })
  }
)

// ============================================================================
// Task 7 — onDeliveryStatusChanged + onRestaurantCancelOrder
// ============================================================================

export const onDeliveryStatusChanged = onDocumentUpdated(
  { document: 'food_delivery_orders/{orderId}', region: 'europe-west1' },
  async (event) => {
    if (!event.data) return
    const before = event.data.before.data()
    const after  = event.data.after.data()
    if (!before || !after || before.status === after.status) return

    const db = admin.firestore()
    const statusMapping: Record<string, string> = {
      heading_to_restaurant: 'driver_heading_to_restaurant',
      arrived_restaurant:    'driver_arrived_restaurant',
      picked_up:             'picked_up',
      heading_to_client:     'out_for_delivery',
      arrived_client:        'arriving',
      delivered:             'delivered',
      cancelled:             'cancelled',
    }

    const foodOrderStatus = statusMapping[after.status]
    if (!foodOrderStatus) return

    await db.collection('food_orders').doc(event.params.orderId).update({
      status: foodOrderStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      })
      return
    }

    await db.collection('food_delivery_orders').doc(event.params.orderId).update({
      status: 'cancelled',
      cancellationReason: 'restaurant_cancelled',
      cancellationImpactOnStats: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    await db.collection('drivers').doc(deliveryOrder.driverId).update({
      activeDeliveryOrderId: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    if (after.status === 'delivered') {
      driverUpdate.deliveriesCompleted = admin.firestore.FieldValue.increment(1)
      driverUpdate.deliveryEarnings = admin.firestore.FieldValue.increment(after.driverEarnings ?? 0)
    }

    await db.collection('drivers').doc(driverId).update(driverUpdate)

    await admin.auth().setCustomUserClaims(driverId, { activeDeliveryOrderId: null })

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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    if (attemptNumber >= 3) {
      await db.collection('food_orders').doc(orderId).update({
        status: 'no_driver_available',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      await orderRef.update({
        status: 'cancelled',
        cancellationReason: 'driver_cancelled',
        cancellationImpactOnStats: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      res.status(200).send('No driver available after 3 attempts')
      return
    }

    const foodOrderSnap = await db.collection('food_orders').doc(orderId).get()
    const foodOrder = foodOrderSnap.data()!

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
      await db.collection('food_orders').doc(orderId).update({ status: 'no_driver_available', updatedAt: admin.firestore.FieldValue.serverTimestamp() })
      await orderRef.update({ status: 'cancelled', cancellationReason: 'driver_cancelled', cancellationImpactOnStats: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
      res.status(200).send('No candidate found')
      return
    }

    await orderRef.update({ driverId: nextDriver.id, status: 'assigned', updatedAt: admin.firestore.FieldValue.serverTimestamp() })
    await db.collection('drivers').doc(nextDriver.id).update({ activeDeliveryOrderId: orderId, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
    await admin.auth().setCustomUserClaims(nextDriver.id, { activeDeliveryOrderId: orderId })

    const driverSnap = await db.collection('drivers').doc(nextDriver.id).get()
    const fcmToken = driverSnap.data()?.fcmToken
    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: { title: 'Nouvelle commande', body: foodOrder.orderNumber ?? '' },
        data: { type: 'delivery_order_new', orderId },
      })
    }

    const cloudTasksClient = await getCloudTasksClient();
    const PROJECT_ID = process.env.GCLOUD_PROJECT ?? ''
    const LOCATION = 'europe-west1'
    const queuePath = cloudTasksClient.queuePath(PROJECT_ID, LOCATION, 'delivery-order-timeout')
    await cloudTasksClient.createTask({
      parent: queuePath,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/onDeliveryOrderTimeout`,
          oidcToken: {
            serviceAccountEmail: `${PROJECT_ID}@appspot.gserviceaccount.com`,
          },
          body: Buffer.from(JSON.stringify({ orderId, attemptNumber: attemptNumber + 1 })).toString('base64'),
          headers: { 'Content-Type': 'application/json' },
        },
        scheduleTime: { seconds: Math.floor(Date.now() / 1000) + 90 },
      },
    })

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
        updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
      })
    })
  }
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
        tx.update(rateLimitRef, { count: admin.firestore.FieldValue.increment(1) })
      } else {
        tx.set(rateLimitRef, { count: 1, resetAt: now + PIN_FAILURE_WINDOW_MS })
      }
    })

    await db.collection('audit_logs').add({
      type: 'delivery_pin_failed',
      orderId,
      driverId: uid,
      clientPhone,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
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
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
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
  { cors: true },
  (request: CallableRequest) => manageTopicSubscription(request, 'subscribe')
);

export const unsubscribeFromTopic = onCall(
  { cors: true },
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
      await docRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
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

    return { success: true };
  }
);

export { stripeWebhookInstant, stripeWebhookLight, createSetupIntent, createConnectAccount, createConnectOnboardLink, getStripeAccountStatus } from './stripe/index.js';
export { stripeConnectPayout } from './stripe/stripeConnectPayout.js';
export { stripePaymentIntent } from './stripe/stripePaymentIntent.js';
export { stripeWalletRecharge } from './stripe/stripeWalletRecharge.js';

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
  authVerifyCode,
} from './authApi/index.js';

export {
  walletGetBalance,
  walletEnsure,
  walletFailTransaction,
  walletPayBooking,
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
