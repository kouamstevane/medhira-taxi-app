import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const resendApiKey = defineSecret('RESEND_API_KEY');

export const sendVerificationCode = onCall(
  { cors: true, secrets: [resendApiKey] },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    const uid = request.auth.uid;
    const tokenEmail = request.auth.token.email;

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
      throw new HttpsError('permission-denied', "L'email ne correspond pas à votre compte.");
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

    const crypto = await import('crypto');
    const code = String(crypto.randomInt(100000, 1000000));
    const salt = crypto.randomBytes(16).toString('hex');
    const hashedCode = await new Promise<string>((resolve, reject) =>
      crypto.pbkdf2(code, salt, 100_000, 64, 'sha512', (err, key) =>
        err ? reject(err) : resolve(key.toString('hex'))
      )
    );

    let messageId: string | undefined;
    try {
      const { sendVerificationCodeEmail } = await import('../email-service.js');
      const emailResult = await sendVerificationCodeEmail({
        to: email,
        code,
        uid,
        apiKey: resendApiKey.value(),
      });
      messageId = emailResult.messageId;
    } catch (err) {
      console.error('[sendVerificationCode] Erreur Resend:', err);
      throw new HttpsError('internal', "Erreur lors de l'envoi de l'email. Réessayez.");
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

    const crypto = await import('crypto');
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
