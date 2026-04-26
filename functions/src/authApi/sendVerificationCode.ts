/**
 * Cloud Function `authSendVerificationCode` — Envoie un code OTP par email
 *
 * Migration de `src/app/api/auth/send-verification-code/route.ts` vers `onCall`.
 *
 * Note: la route originale exige un utilisateur authentifié (le code OTP est
 * envoyé pour vérifier l'email d'un compte déjà créé). Ce comportement est
 * conservé ici. Le rate-limiter combine UID + IP pour protéger la surface
 * d'envoi d'email (Resend est facturé à l'envoi).
 *
 * @module authApi/sendVerificationCode
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { z } from 'zod';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { sendVerificationCodeEmail } from '../email-service.js';

const resendApiKey = defineSecret('RESEND_API_KEY');

const SendVerificationCodeSchema = z.object({
  email: z.string().email('Adresse email invalide'),
});

interface SendVerificationCodeResult {
  success: boolean;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

export const authSendVerificationCode = onCall(
  {
    region: 'europe-west1',
    secrets: [resendApiKey],
  },
  async (
    request: CallableRequest<unknown>,
  ): Promise<SendVerificationCodeResult> => {
    // Authentification: la route originale exige un utilisateur connecté.
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Non authentifié.');
    }
    const uid = request.auth.uid;
    const tokenEmail = request.auth.token.email as string | undefined;

    // Validation du payload
    const parsed = SendVerificationCodeSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        'invalid-argument',
        parsed.error.issues[0].message,
      );
    }
    const { email } = parsed.data;

    // Sécurité : on n'envoie qu'à sa propre adresse
    if (tokenEmail !== email) {
      throw new HttpsError(
        'permission-denied',
        "L'email ne correspond pas à votre compte.",
      );
    }

    // Rate-limit cross-instance (uid + IP combinés). 1 envoi max / minute par
    // uid, 5 / minute par IP — protège contre les abus depuis une même
    // adresse utilisée par plusieurs comptes (tentative de spam Resend).
    const ip = request.rawRequest?.ip ?? 'unknown';

    await enforceRateLimit({
      identifier: uid,
      bucket: 'auth:sendVerificationCode:uid',
      limit: 1,
      windowSec: 60,
      message: 'Trop de tentatives. Réessayez dans quelques secondes.',
    });
    await enforceRateLimit({
      identifier: ip,
      bucket: 'auth:sendVerificationCode:ip',
      limit: 5,
      windowSec: 60,
      message: 'Trop de tentatives. Réessayez dans quelques secondes.',
    });

    const db = getDb();
    const docRef = db.collection('emailVerificationCodes').doc(uid);

    // Génération du code (6 chiffres) + hash PBKDF2
    const code = String(crypto.randomInt(100000, 1000000));
    const salt = crypto.randomBytes(16).toString('hex');
    const hashedCode = await new Promise<string>((resolve, reject) =>
      crypto.pbkdf2(code, salt, 100_000, 64, 'sha512', (err, key) =>
        err ? reject(err) : resolve(key.toString('hex')),
      ),
    );

    // Envoyer l'email d'abord — n'écrire en Firestore qu'en cas de succès,
    // pour ne pas pénaliser l'utilisateur si Resend est indisponible.
    let messageId: string | undefined;
    try {
      const emailResult = await sendVerificationCodeEmail({
        to: email,
        code,
        uid,
        apiKey: resendApiKey.value(),
      });
      messageId = emailResult.messageId;
    } catch (err) {
      console.error('[authSendVerificationCode] Erreur Resend:', err);
      throw new HttpsError(
        'internal',
        "Erreur lors de l'envoi de l'email. Réessayez.",
      );
    }

    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      Date.now() + 15 * 60 * 1000,
    );

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
  },
);
