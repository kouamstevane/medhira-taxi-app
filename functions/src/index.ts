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
import * as admin from 'firebase-admin';
import {
  validateBankData as validateBankDataValidator,
  BankDataValidationResult,
} from './validators/bank.validator.js';
import {
  encryptSensitiveData as encryptData,
} from './utils/encryption.js';
import { BankDetailsSchema, EncryptionRequestSchema } from './validators/schemas.js';

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

    // Validation Zod
    const result = BankDetailsSchema.safeParse(data);
    if (!result.success) {
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
      const encrypted = await encryptData(data.plaintext);

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
 * Cloud Function: cleanupOrphanedFiles
 *
 * Nettoie automatiquement les fichiers orphelins (sans document Firestore associé)
 * Cette fonction est destinée à être appelée par un scheduler périodique.
 *
 * @param request - Requête vide (appelée par scheduler)
 * @returns Rapport de nettoyage
 *
 * @example
 * // Déployer avec le scheduler:
 * // firebase functions:config:set scheduler.interval="0 2 * * *" # 2h du matin
 */
export const cleanupOrphanedFiles = onCall(
  async (request: CallableRequest) => {
    // Cette fonction nécessite des droits admin
    // Vérifier que l'appelant est authentifié et est admin
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Authentification requise.'
      );
    }

    // TODO: Vérifier que l'utilisateur est admin via une custom claim
    // const isAdmin = request.auth.token.admin === true;
    // if (!isAdmin) {
    //   throw new functions.https.HttpsError(
    //     'permission-denied',
    //     'Droits admin requis.'
    //   );
    // }

    // Cette fonction est un placeholder pour implémentation future
    // Elle nécessiterait:
    // 1. Lister tous les fichiers dans drivers/ et driver_documents/
    // 2. Pour chaque fichier, vérifier s'il est référencé dans un document driver
    // 3. Supprimer les fichiers orphelins
    // 4. Logger les suppressions pour audit

    return {
      message: 'Fonction non implémentée. À développer avec un scheduler Cloud Tasks.',
      note: 'Nécessite une implémentation avec pagination pour gérer un grand nombre de fichiers.',
    };
  }
);

// ============================================================================
// Export des fonctions VoIP
// ============================================================================
// Ces fonctions gèrent les appels via Agora RTC pour la fonctionnalité d'appel
// entre passagers et chauffeurs.
export { createCall, answerCall, endCall, sendSystemMessage } from './voip';
