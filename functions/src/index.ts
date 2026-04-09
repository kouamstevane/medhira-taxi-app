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
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import {
  validateBankData as validateBankDataValidator,
  BankDataValidationResult,
} from './validators/bank.validator.js';
import {
  encryptSensitiveData as encryptData,
} from './utils/encryption.js';
import { createNotification } from './utils/notificationService.js';
import { BankDetailsSchema, EncryptionRequestSchema } from './validators/schemas.js';
import { onDocumentWritten, onDocumentCreated } from 'firebase-functions/v2/firestore';
import { isEncryptedData, hasRequiredFields } from './utils/validation.js';
import * as crypto from 'crypto';
import { getDatabase } from 'firebase-admin/database';
import { CloudTasksClient } from '@google-cloud/tasks';
import { DELIVERY_SHARE_RATE } from './config/stripe.js';
import { selectNearestDriver } from './utils/matching.js';

// Définir le secret de chiffrement depuis Firebase Secret Manager
const encryptionMasterKey = defineSecret('ENCRYPTION_MASTER_KEY');

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
      const doc = await docRef.get();

      if (!doc.exists) {
        // Première requête
        await docRef.set({
          count: 1,
          windowStart: now,
          lastReset: now,
        });
        return true;
      }

      const data = doc.data()!;
      const timeSinceReset = now - (data.lastReset || 0);

      // Réinitialiser si la fenêtre est expirée
      if (timeSinceReset >= this.windowMs) {
        await docRef.update({
          count: 1,
          lastReset: now,
          windowStart: now,
        });
        return true;
      }

      // Vérifier si la limite est atteinte
      if (data.count >= this.maxRequests) {
        return false;
      }

      // Incrémenter le compteur
      await docRef.update({
        count: admin.firestore.FieldValue.increment(1),
      });

      return true;
    } catch (error) {
      console.error('Erreur Rate Limiter:', error);
      // En cas d'erreur, bloquer la requête (fail-secure) pour éviter les abus
      // Si le rate limiter est en panne, il vaut mieux bloquer que de permettre des abus
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
    console.log(`[validateBankDetails] Validation request from ${identifier}:`, {
      accountHolder: data.accountHolder,
      iban: data.iban ? `${data.iban.substring(0, 8)}...` : 'missing',
      bic: data.bic
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

    const payload = request.data as {
      driverId?: string;
      driverData?: Record<string, unknown>;
    };

    if (!payload?.driverId || typeof payload.driverId !== 'string') {
      throw new HttpsError('invalid-argument', 'driverId manquant ou invalide.');
    }

    if (!payload.driverData || typeof payload.driverData !== 'object') {
      throw new HttpsError('invalid-argument', 'driverData manquant ou invalide.');
    }

    if (request.auth.uid !== payload.driverId) {
      throw new HttpsError('permission-denied', 'UID mismatch.');
    }

    const authEmail = request.auth.token.email as string | undefined;
    const driverData = payload.driverData;

    if (!driverData.email) {
      throw new HttpsError('invalid-argument', 'Email manquant dans les données du chauffeur.');
    }
    if (authEmail && driverData.email !== authEmail) {
      throw new HttpsError('permission-denied', 'Email mismatch: L\'email fourni ne correspond pas à l\'email authentifié.');
    }


    if (driverData.phoneNumber !== null) {
      throw new HttpsError('failed-precondition', 'phoneNumber doit être null.');
    }

    if (driverData.userType !== 'chauffeur') {
      throw new HttpsError('failed-precondition', 'userType invalide.');
    }

    // Valider driverType (nouveau) — userType reste toujours 'chauffeur'
    const validDriverTypes = ['chauffeur', 'livreur', 'les_deux']
    if (!validDriverTypes.includes(driverData.driverType as string)) {
      throw new HttpsError('failed-precondition', 'driverType invalide. Valeurs acceptées: chauffeur, livreur, les_deux.')
    }

    // ⚠️ CORRECTION : year < 2010 rejette les anciens véhicules (pas > 2010 !)
    if (
      (driverData.driverType === 'chauffeur' || driverData.driverType === 'les_deux') &&
      (driverData.car as Record<string, unknown> | undefined)?.year != null &&
      Number((driverData.car as Record<string, unknown>).year) < 2010   // REJETER si ANTÉRIEUR à 2010
    ) {
      throw new HttpsError('failed-precondition', 'Véhicule trop ancien. Année minimale: 2010.')
    }

    const allowedStatuses = ['pending', 'action_required', 'rejected'];
    const status = driverData.status as string | undefined;
    if (!status || !allowedStatuses.includes(status)) {
      throw new HttpsError('failed-precondition', `status invalide. Attendu: ${allowedStatuses.join(', ')}, Reçu: ${status}`);
    }

    const requiredFields = ['firstName', 'lastName', 'dob', 'nationality', 'address', 'city', 'zipCode', 'phone', 'documents']
    if (driverData.driverType === 'chauffeur' || driverData.driverType === 'les_deux') {
      requiredFields.push('car')
    }
    if (driverData.driverType === 'livreur' && driverData.vehicleType !== 'velo' && !driverData.deliveryVehicle) {
      throw new HttpsError('failed-precondition', 'Véhicule livreur manquant.')
    }

    if (!hasRequiredFields(driverData, requiredFields)) {
      throw new HttpsError('failed-precondition', 'Champs requis manquants.');
    }

    if (driverData.ssn != null && !isEncryptedData(driverData.ssn)) {
      throw new HttpsError('failed-precondition', 'SSN non chiffré.');
    }

    if (driverData.bank != null && !isEncryptedData(driverData.bank)) {
      throw new HttpsError('failed-precondition', 'Données bancaires non chiffrées.');
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

    const data = request.data as {
      fileUrls?: string[];
    };

    // Vérifier que les données requises sont présentes
    if (!data.fileUrls || !Array.isArray(data.fileUrls) || data.fileUrls.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'Aucun fichier à nettoyer.'
      );
    }

    let deletedCount = 0;
    const errors: string[] = [];

    // Traiter chaque fichier
    for (const fileUrl of data.fileUrls) {
      try {
        // Extraire le chemin du fichier depuis l'URL
        // Format: https://firebasestorage.googleapis.com/v0/b/bucket/o/drivers%2FuserId%2F...
        const url = new URL(fileUrl);
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
export { createCall, answerCall, endCall, sendSystemMessage } from './voip/index.js';

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

    // L'email de bienvenue est envoyé automatiquement par la Cloud Function sendVerificationEmail
    // lors de l'inscription du chauffeur via le client.
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
// Export des fonctions d'envoi d'emails via Resend
// ============================================================================
// Ces fonctions utilisent Resend + react-email pour envoyer des emails avec
// une excellente délivrabilité (SPF/DKIM configuré)
export { sendVerificationEmail, sendVerificationEmailHttp } from './emails/send-verification-email.js';

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
export const onFoodOrderCreated = onDocumentUpdated(
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

    // 1. Générer orderNumber via compteur atomique par restaurant
    const restaurantRef = admin.firestore().collection('restaurants').doc(restaurantId)
    const orderNumber = await admin.firestore().runTransaction(async (tx) => {
      const restaurantDoc = await tx.get(restaurantRef)
      const counter = (restaurantDoc.data()?.orderCounter || 0) + 1
      tx.update(restaurantRef, { orderCounter: counter })
      return `#${counter}`
    })

    // 2. Générer pinCode si nécessaire
    const deliveryPreference = after.deliveryPreference as string | undefined
    const pinCode = (deliveryPreference === 'meet_outside' || deliveryPreference === 'meet_at_door')
      ? crypto.randomInt(1000, 9999).toString()
      : null

    // 3. Lire les infos restaurant pour dénormalisation
    const restaurantDoc = await admin.firestore().collection('restaurants').doc(restaurantId).get()
    const restaurantData = restaurantDoc.data()

    // 4. Enrichir food_orders avec les champs requis
    const updates: Record<string, unknown> = {
      orderNumber,
      cityId: after.cityId || restaurantData?.cityId || 'edmonton',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
    if (pinCode != null) updates.pinCode = pinCode
    if (!after.restaurantAddress && restaurantData) {
      updates.restaurantAddress = {
        address: restaurantData.address,
        lat: restaurantData.location?.lat ?? 0,
        lng: restaurantData.location?.lng ?? 0,
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
        click_action: 'FLUTTER_NOTIFICATION_CLICK', // Adapter selon Capacitor/Flutter
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

  } catch (error) {
    const err = error as Record<string, unknown>;
    if (err.code === 'messaging/invalid-registration-token' || err.code === 'messaging/registration-token-not-registered') {
      console.log(`[FoodOrderUpdate] Token invalide pour le client ${clientId}. Nettoyage.`);
      // Nettoyage: on pourrait retirer le token du doc user ici
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
    const restaurantAddress = after.restaurantAddress ?? { lat: 0, lng: 0 }
    const nearest = selectNearestDriver(candidatesWithLocation, restaurantAddress)

    // 4. Aucun livreur disponible
    if (!nearest) {
      await db.collection('food_orders').doc(orderId).update({
        status: 'no_driver_available',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      return
    }

    // 5. Créer food_delivery_orders
    await db.collection('food_delivery_orders').doc(orderId).set({
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
    })

    // 6. Marquer le driver comme occupé
    await db.collection('drivers').doc(nearest.id).update({
      activeDeliveryOrderId: orderId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

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
    const PROJECT_ID = process.env.GCLOUD_PROJECT ?? ''
    const LOCATION = 'europe-west1'
    const FUNCTION_URL = `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net`
    const tasksClient = new CloudTasksClient()
    const queuePath = tasksClient.queuePath(PROJECT_ID, LOCATION, 'delivery-order-timeout')
    await tasksClient.createTask({
      parent: queuePath,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: `${FUNCTION_URL}/onDeliveryOrderTimeout`,
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

    await db.collection('drivers').doc(driverId).update({
      activeDeliveryOrderId: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    await admin.auth().setCustomUserClaims(driverId, { activeDeliveryOrderId: null })

    if (after.status === 'delivered') {
      await db.collection('drivers').doc(driverId).update({
        deliveriesCompleted: admin.firestore.FieldValue.increment(1),
        deliveryEarnings:    admin.firestore.FieldValue.increment(after.driverEarnings ?? 0),
        updatedAt:           admin.firestore.FieldValue.serverTimestamp(),
      })
    }

    await rtdb.ref(`delivery_tracking/${orderId}`).remove()
  }
)

export const onDeliveryOrderTimeout = onRequest(
  { region: 'europe-west1' },
  async (req, res) => {
    const queueName = req.headers['x-cloudtasks-queuename'] as string
    if (queueName !== 'delivery-order-timeout') {
      console.warn('[onDeliveryOrderTimeout] Unauthorized invocation', { queueName })
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

    const PROJECT_ID = process.env.GCLOUD_PROJECT ?? ''
    const LOCATION = 'europe-west1'
    const tasksClient = new CloudTasksClient()
    const queuePath = tasksClient.queuePath(PROJECT_ID, LOCATION, 'delivery-order-timeout')
    await tasksClient.createTask({
      parent: queuePath,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/onDeliveryOrderTimeout`,
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

const pinFailureAttempts = new Map<string, { count: number; resetAt: number }>()

export const logPinFailure = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new Error('Unauthenticated')

    const { orderId, clientPhone } = request.data as { orderId: string; clientPhone: string }

    const now = Date.now()
    const driverState = pinFailureAttempts.get(uid)
    if (driverState && now < driverState.resetAt) {
      if (driverState.count >= 5) {
        throw new Error('Rate limit exceeded')
      }
      driverState.count++
    } else {
      pinFailureAttempts.set(uid, { count: 1, resetAt: now + 3600000 })
    }

    await admin.firestore().collection('audit_logs').add({
      type: 'delivery_pin_failed',
      orderId,
      driverId: uid,
      clientPhone,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    })

    return { success: true }
  }
)
