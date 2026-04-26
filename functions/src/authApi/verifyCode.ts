/**
 * Cloud Function `authVerifyCode` — Vérifie le code OTP envoyé par email
 *
 * Migration de `src/app/api/auth/verify-code/route.ts` vers `onCall`.
 *
 * Préserve la sémantique d'origine (succès = HttpsError pour échec,
 * réponse `{ success: false, attemptsLeft }` pour code incorrect).
 *
 * @module authApi/verifyCode
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const VerifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Le code doit contenir exactement 6 chiffres'),
});

interface VerifyCodeResult {
  success: boolean;
  error?: string;
  attemptsLeft?: number;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

export const authVerifyCode = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>): Promise<VerifyCodeResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Non authentifié.');
    }
    const uid = request.auth.uid;

    // Rate-limit pour éviter le brute-force du code 6 chiffres (10 tentatives
    // par minute par UID + par IP). La logique métier limite déjà à 3 essais
    // par code, mais ceci protège contre un attaquant qui demanderait sans
    // cesse de nouveaux codes pour les brute-forcer.
    const ip = request.rawRequest?.ip ?? 'unknown';
    await enforceRateLimit({
      identifier: uid,
      bucket: 'auth:verifyCode:uid',
      limit: 10,
      windowSec: 60,
    });
    await enforceRateLimit({
      identifier: ip,
      bucket: 'auth:verifyCode:ip',
      limit: 30,
      windowSec: 60,
    });

    const parsed = VerifyCodeSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        'invalid-argument',
        parsed.error.issues[0].message,
      );
    }
    const { code } = parsed.data;

    const db = getDb();
    const docRef = db.collection('emailVerificationCodes').doc(uid);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new HttpsError(
        'failed-precondition',
        'Aucun code en attente. Demandez un nouveau code.',
      );
    }

    const data = docSnap.data()!;

    const expiresAt: admin.firestore.Timestamp = data.expiresAt;
    if (expiresAt.toMillis() < Date.now()) {
      await docRef.delete();
      throw new HttpsError(
        'failed-precondition',
        'Code expiré. Demandez un nouveau code.',
      );
    }

    const attempts: number = data.attempts ?? 0;
    if (attempts >= 3) {
      await docRef.delete();
      throw new HttpsError(
        'failed-precondition',
        'Trop de tentatives. Demandez un nouveau code.',
      );
    }

    const salt: string = data.salt;
    const hashedSubmitted = await new Promise<string>((resolve, reject) =>
      crypto.pbkdf2(code, salt, 100_000, 64, 'sha512', (err, key) =>
        err ? reject(err) : resolve(key.toString('hex')),
      ),
    );

    const submitted = Buffer.from(hashedSubmitted, 'hex');
    const stored = Buffer.from(data.code, 'hex');
    if (
      submitted.length !== stored.length ||
      !timingSafeEqual(submitted, stored)
    ) {
      const newAttempts = attempts + 1;
      if (newAttempts >= 3) {
        await docRef.delete();
        return {
          success: false,
          error:
            'Code incorrect. Trop de tentatives. Demandez un nouveau code.',
          attemptsLeft: 0,
        };
      }
      await docRef.update({
        attempts: admin.firestore.FieldValue.increment(1),
      });
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
    } catch (err) {
      console.warn(
        '[authVerifyCode] Mise à jour drivers échouée (doc probablement inexistant):',
        err,
      );
    }

    try {
      await db.collection('users').doc(uid).update({
        emailVerified: true,
        emailVerifiedAt: admin.firestore.Timestamp.now(),
      });
    } catch (err) {
      console.warn(
        '[authVerifyCode] Mise à jour users échouée (doc probablement inexistant):',
        err,
      );
    }

    return { success: true };
  },
);
