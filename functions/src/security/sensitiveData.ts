import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { encryptionMasterKey } from '../config/secrets.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';

class RateLimiter {
  private maxRequests: number;
  private windowMs: number;
  private db: admin.firestore.Firestore;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.db = admin.firestore();
  }

  async check(identifier: string, keyPrefix: string): Promise<boolean> {
    const now = Date.now();
    const docRef = this.db.collection('rate_limits').doc(`${keyPrefix}_${identifier}`);

    try {
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
      return false;
    }
  }
}

const bankValidationLimiter = new RateLimiter(10, 60 * 1000);
const encryptionLimiter = new RateLimiter(20, 60 * 1000);

export const validateBankDetails = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Vous devez être connecté pour effectuer cette action.'
      );
    }

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
      hasAccountHolder: Boolean(data.accountHolder),
      hasIban: Boolean(data.iban),
      hasBic: Boolean(data.bic),
    });

    const { BankDetailsSchema } = await import('../validators/schemas.js');
    const result = BankDetailsSchema.safeParse(data);
    if (!result.success) {
      console.warn(`[validateBankDetails] Zod validation failed for ${identifier}:`, result.error.format());
      throw new HttpsError(
        'invalid-argument',
        'Données bancaires invalides',
        result.error.format()
      );
    }

    const { validateBankData: validateBankDataValidator } = await import('../validators/bank.validator.js');
    const validationResult = validateBankDataValidator({
      accountHolder: data.accountHolder,
      iban: data.iban,
      bic: data.bic,
    });

    return {
      isValid: validationResult.isValid,
      errors: validationResult.errors,
    };
  }
);

export const encryptSensitiveData = onCall(
  {
    cors: true,
    secrets: [encryptionMasterKey],
  },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Vous devez être connecté pour effectuer cette action.'
      );
    }

    const identifier = request.auth.uid || 'anonymous';
    const allowed = await encryptionLimiter.check(identifier, 'encryption');
    if (!allowed) {
      throw new HttpsError(
        'resource-exhausted',
        'Trop de tentatives de chiffrement. Réessayez dans une minute.'
      );
    }

    const data = request.data;

    const { EncryptionRequestSchema } = await import('../validators/schemas.js');
    const result = EncryptionRequestSchema.safeParse(data);
    if (!result.success) {
      throw new HttpsError(
        'invalid-argument',
        'Données à chiffrer invalides',
        result.error.format()
      );
    }

    try {
      const { encryptSensitiveData: encryptData } = await import('../utils/encryption.js');
      const encrypted = await encryptData(data.plaintext, encryptionMasterKey.value());

      return {
        encrypted,
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

export const cleanupFailedUploads = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Vous devez être connecté pour effectuer cette action.'
      );
    }

    await enforceRateLimit({
      identifier: request.auth.uid,
      bucket: 'cleanup:failedUploads',
      limit: 10,
      windowSec: 60,
    });

    const { z } = await import('zod');
    const cleanupSchema = z.object({
      fileUrls: z.array(z.string().url()).min(1),
    });
    const data = cleanupSchema.parse(request.data);

    let deletedCount = 0;
    const errors: string[] = [];

    for (const fileUrl of data.fileUrls) {
      try {
        const url = new URL(fileUrl);

        if (url.hostname !== 'firebasestorage.googleapis.com') {
          errors.push(`Hôte non autorisé: ${url.hostname}`);
          continue;
        }

        const pathMatch = url.pathname.match(/\/o\/(.+)(?:\?|$)/);
        if (!pathMatch) {
          errors.push(`URL invalide: ${fileUrl}`);
          continue;
        }

        const filePath = decodeURIComponent(pathMatch[1]);

        if (
          !filePath.startsWith(`drivers/${request.auth.uid}/`) &&
          !filePath.startsWith(`driver_documents/${request.auth.uid}/`)
        ) {
          errors.push(`Accès non autorisé au fichier: ${filePath}`);
          continue;
        }

        const bucket = admin.storage().bucket();
        const file = bucket.file(filePath);

        const [exists] = await file.exists();
        if (!exists) {
          errors.push(`Fichier introuvable: ${filePath}`);
          continue;
        }

        await file.delete();
        deletedCount++;

        console.log(`Fichier supprimé (cleanup): ${filePath} par ${request.auth.uid}`);
      } catch (error) {
        console.error(`Erreur lors de la suppression du fichier ${fileUrl}:`, error);
        errors.push(`Erreur suppression: ${fileUrl}`);
      }
    }

    return {
      deletedCount,
      totalFiles: data.fileUrls.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
);
