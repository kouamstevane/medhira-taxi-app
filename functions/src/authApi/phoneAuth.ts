import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import twilio from 'twilio';
import {
  handleStartPhoneVerification,
  handleVerifyPhoneCode,
  StartPhoneVerificationInput,
  VerifyPhoneCodeInput,
} from './phoneAuthCore.js';
import { enforceRateLimit as firestoreRateLimit } from '../utils/rateLimiter.js';

const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');
const twilioVerifyServiceSid = defineSecret('TWILIO_VERIFY_SERVICE_SID');

type TwilioVerificationStatus = 'approved' | 'pending' | 'canceled';

interface TwilioRestError {
  code?: number;
  status?: number;
  message?: string;
}

interface RateLimitPayload {
  identifier?: unknown;
  bucket?: unknown;
  limit?: unknown;
  windowSec?: unknown;
  message?: unknown;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function hashPhone(phoneNumber: string): string {
  return crypto.createHash('sha256').update(phoneNumber).digest('hex');
}

function getIp(request: CallableRequest<unknown>): string {
  return request.rawRequest?.ip ?? 'unknown';
}

function getTwilioClient() {
  return twilio(twilioAccountSid.value(), twilioAuthToken.value());
}

function getVerifyService() {
  return getTwilioClient().verify.v2.services(twilioVerifyServiceSid.value());
}

function mapTwilioStartVerificationError(err: unknown): HttpsError {
  const twilioError = err as TwilioRestError;
  if (twilioError.code === 21608) {
    return new HttpsError(
      'failed-precondition',
      'Ce compte Twilio est en mode essai. Vérifiez ce numéro dans Twilio ou passez le compte Twilio en production.',
    );
  }

  return new HttpsError('internal', "Erreur lors de l'envoi du SMS. Réessayez.");
}

async function enforceHashedRateLimit(input: unknown): Promise<void> {
  const options = input as RateLimitPayload;
  const identifier = typeof options.identifier === 'string' && options.identifier.startsWith('+')
    ? `phone:${hashPhone(options.identifier)}`
    : options.identifier;

  await firestoreRateLimit({
    identifier: typeof identifier === 'string' ? identifier : 'unknown',
    bucket: typeof options.bucket === 'string' ? options.bucket : 'auth:phone',
    limit: typeof options.limit === 'number' ? options.limit : 1,
    windowSec: typeof options.windowSec === 'number' ? options.windowSec : 60,
    message: typeof options.message === 'string' ? options.message : undefined,
  });
}

async function findPhoneIdentity(phoneNumber: string): Promise<{ uid: string } | null> {
  const snap = await getDb().collection('phoneIdentities').doc(hashPhone(phoneNumber)).get();
  if (!snap.exists) return null;

  const uid = snap.data()?.uid;
  return typeof uid === 'string' ? { uid } : null;
}

async function createPhoneIdentity(phoneNumber: string): Promise<{ uid: string }> {
  const db = getDb();
  const phoneHash = hashPhone(phoneNumber);
  const docRef = db.collection('phoneIdentities').doc(phoneHash);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const existingUid = snap.data()?.uid;
    if (snap.exists && typeof existingUid === 'string') {
      return { uid: existingUid };
    }

    const uid = `client_phone_${crypto.randomUUID()}`;
    const now = admin.firestore.FieldValue.serverTimestamp();
    tx.set(docRef, {
      uid,
      phoneHash,
      phoneNumber,
      provider: 'twilio_verify',
      createdAt: now,
      updatedAt: now,
    });
    return { uid };
  });
}

async function upsertClientUser(input: {
  uid: string;
  phoneNumber: string;
  profile: {
    firstName: string;
    lastName: string;
    country?: string;
  };
  phoneVerifiedAt: Date;
}): Promise<void> {
  const db = getDb();
  const userRef = db.collection('users').doc(input.uid);
  const snap = await userRef.get();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const phoneVerifiedAt = admin.firestore.Timestamp.fromDate(input.phoneVerifiedAt);

  if (snap.exists) {
    await userRef.update({
      phoneNumber: input.phoneNumber,
      phoneVerified: true,
      phoneVerifiedAt,
      firstName: input.profile.firstName,
      lastName: input.profile.lastName,
      ...(input.profile.country ? { country: input.profile.country } : {}),
      updatedAt: now,
    });
    return;
  }

  await userRef.set({
    uid: input.uid,
    email: null,
    phoneNumber: input.phoneNumber,
    phoneVerified: true,
    phoneVerifiedAt,
    emailVerified: false,
    firstName: input.profile.firstName,
    lastName: input.profile.lastName,
    profileImageUrl: '',
    ...(input.profile.country ? { country: input.profile.country } : { country: null }),
    roles: {
      client: {
        enabled: true,
        joinedAt: now,
      },
    },
    activeRole: 'client',
    createdAt: now,
    updatedAt: now,
  });
}

export const authStartPhoneVerification = onCall(
  {
    region: 'europe-west1',
    secrets: [twilioAccountSid, twilioAuthToken, twilioVerifyServiceSid],
  },
  async (request: CallableRequest<unknown>) => {
    return handleStartPhoneVerification(
      request.data as StartPhoneVerificationInput,
      { ip: getIp(request) },
      {
        enforceRateLimit: enforceHashedRateLimit,
        createVerification: async (phoneNumber) => {
          try {
            await getVerifyService().verifications.create({
              to: phoneNumber,
              channel: 'sms',
            });
          } catch (err) {
            console.error('[authStartPhoneVerification] Twilio error:', err);
            throw mapTwilioStartVerificationError(err);
          }
        },
      },
    );
  },
);

export const authVerifyPhoneCode = onCall(
  {
    region: 'europe-west1',
    secrets: [twilioAccountSid, twilioAuthToken, twilioVerifyServiceSid],
  },
  async (request: CallableRequest<unknown>) => {
    return handleVerifyPhoneCode(
      request.data as VerifyPhoneCodeInput,
      { ip: getIp(request) },
      {
        enforceRateLimit: enforceHashedRateLimit,
        findPhoneIdentity,
        createPhoneIdentity,
        upsertClientUser,
        createCustomToken: (uid, claims) => admin.auth().createCustomToken(uid, claims),
        now: () => new Date(),
        createVerification: async () => undefined,
        checkVerification: async (phoneNumber, code) => {
          try {
            const result = await getVerifyService().verificationChecks.create({
              to: phoneNumber,
              code,
            });
            return result.status as TwilioVerificationStatus;
          } catch (err) {
            console.warn('[authVerifyPhoneCode] Twilio check failed:', err);
            return 'pending';
          }
        },
      },
    );
  },
);
