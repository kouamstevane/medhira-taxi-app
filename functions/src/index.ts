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

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
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
import { BankDetailsSchema, EncryptionRequestSchema } from './validators/schemas.js';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { isEncryptedData, hasRequiredFields } from './utils/validation.js';

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
      // ✅ FIX: Passer la valeur du secret explicitement pour éviter les dépendances implicites
      const encrypted = await encryptData(data.plaintext, encryptionMasterKey.value());

      // Retourner les données chiffrées
      return {
        encrypted: encrypted,
      };
    } catch (error: any) {
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
    const allowedStatuses = ['pending', 'action_required', 'rejected'];
    const status = driverData.status as string | undefined;
    if (!status || !allowedStatuses.includes(status)) {
      throw new HttpsError('failed-precondition', `status invalide. Attendu: ${allowedStatuses.join(', ')}, Reçu: ${status}`);
    }

    const requiredFields = [
      'firstName',
      'lastName',
      'dob',
      'nationality',
      'address',
      'city',
      'zipCode',
      'phone',
      'car',
      'documents',
    ];

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
    } catch (transactionError: any) {
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
      } catch (error: any) {
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
      } catch (err: any) {
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
// CORRECTION FCFA→CAD #6: Export des fonctions de migration de devise
// ============================================================================
// Ces fonctions permettent de migrer toutes les données existantes de FCFA (Cameroun)
// vers CAD (Canada) avec un taux de conversion de ~285 FCFA/CAD
export { migrateCurrencyToCAD, migrateCurrencyToCADHTTP } from './migrateCurrency.js';

// ============================================================================
// Export des fonctions d'envoi d'emails via Resend
// ============================================================================
// Ces fonctions utilisent Resend + react-email pour envoyer des emails avec
// une excellente délivrabilité (SPF/DKIM configuré)
export { sendVerificationEmail, sendVerificationEmailHttp } from './emails/send-verification-email.js';
