import { HttpsError } from 'firebase-functions/v2/https';

const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const OTP_REGEX = /^\d{4,10}$/;

export interface StartPhoneVerificationInput {
  phoneNumber?: unknown;
}

export interface VerifyPhoneCodeInput {
  phoneNumber?: unknown;
  code?: unknown;
  profile?: {
    firstName?: unknown;
    lastName?: unknown;
    country?: unknown;
  };
}

export interface PhoneAuthContext {
  ip: string;
}

export interface PhoneAuthDeps {
  createVerification(phoneNumber: string): Promise<void>;
  checkVerification(phoneNumber: string, code: string): Promise<'approved' | 'pending' | 'canceled'>;
  enforceRateLimit(options: unknown): Promise<void>;
  findPhoneIdentity(phoneNumber: string): Promise<{ uid: string } | null>;
  createPhoneIdentity(phoneNumber: string): Promise<{ uid: string }>;
  upsertClientUser(input: {
    uid: string;
    phoneNumber: string;
    profile?: {
      firstName: string;
      lastName: string;
      country?: string;
    };
    phoneVerifiedAt: Date;
  }): Promise<void>;
  createCustomToken(uid: string, claims: Record<string, unknown>): Promise<string>;
  now(): Date;
}

export interface StartPhoneVerificationResult {
  success: true;
  phoneNumber: string;
  maskedPhone: string;
  resendAfterSec: number;
}

export interface VerifyPhoneCodeResult {
  success: true;
  uid: string;
  customToken: string;
  isNewUser: boolean;
}

function normalizePhoneNumber(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Numéro de téléphone invalide.');
  }

  const normalized = value.replace(/[\s().-]/g, '');
  if (!E164_PHONE_REGEX.test(normalized)) {
    throw new HttpsError('invalid-argument', 'Numéro de téléphone invalide.');
  }

  return normalized;
}

function normalizeCode(value: unknown): string {
  if (typeof value !== 'string' || !OTP_REGEX.test(value)) {
    throw new HttpsError('invalid-argument', 'Code de vérification invalide.');
  }

  return value;
}

function normalizeProfile(input: VerifyPhoneCodeInput['profile']) {
  if (input === undefined) return undefined;

  const firstName = typeof input?.firstName === 'string' ? input.firstName.trim() : '';
  const lastName = typeof input?.lastName === 'string' ? input.lastName.trim() : '';
  const country = typeof input?.country === 'string' ? input.country.trim().toUpperCase() : undefined;

  if (!firstName) {
    throw new HttpsError('invalid-argument', 'Nom complet requis.');
  }

  return {
    firstName,
    lastName,
    ...(country ? { country } : {}),
  };
}

function maskPhoneNumber(phoneNumber: string): string {
  const prefix = phoneNumber.slice(0, 2);
  const suffix = phoneNumber.slice(-4);
  return `${prefix}******${suffix}`;
}

export async function handleStartPhoneVerification(
  input: StartPhoneVerificationInput,
  context: PhoneAuthContext,
  deps: Pick<PhoneAuthDeps, 'createVerification' | 'enforceRateLimit'>,
): Promise<StartPhoneVerificationResult> {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);

  await deps.enforceRateLimit({
    identifier: context.ip,
    bucket: 'auth:phone:start:ip',
    limit: 5,
    windowSec: 60,
    message: 'Trop de demandes. Réessayez dans quelques instants.',
  });
  await deps.enforceRateLimit({
    identifier: phoneNumber,
    bucket: 'auth:phone:start:phone',
    limit: 3,
    windowSec: 10 * 60,
    message: 'Trop de codes envoyés. Réessayez plus tard.',
  });

  await deps.createVerification(phoneNumber);

  return {
    success: true,
    phoneNumber,
    maskedPhone: maskPhoneNumber(phoneNumber),
    resendAfterSec: 60,
  };
}

export async function handleVerifyPhoneCode(
  input: VerifyPhoneCodeInput,
  context: PhoneAuthContext,
  deps: PhoneAuthDeps,
): Promise<VerifyPhoneCodeResult> {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const code = normalizeCode(input.code);

  await deps.enforceRateLimit({
    identifier: context.ip,
    bucket: 'auth:phone:verify:ip',
    limit: 10,
    windowSec: 60,
    message: 'Trop de tentatives. Réessayez dans quelques instants.',
  });
  await deps.enforceRateLimit({
    identifier: phoneNumber,
    bucket: 'auth:phone:verify:phone',
    limit: 5,
    windowSec: 10 * 60,
    message: 'Trop de tentatives pour ce numéro. Demandez un nouveau code.',
  });

  const status = await deps.checkVerification(phoneNumber, code);
  if (status !== 'approved') {
    throw new HttpsError('permission-denied', 'Code de vérification incorrect.');
  }

  const existingIdentity = await deps.findPhoneIdentity(phoneNumber);
  const profile = normalizeProfile(input.profile);
  const identity = existingIdentity ?? await deps.createPhoneIdentity(phoneNumber);

  await deps.upsertClientUser({
    uid: identity.uid,
    phoneNumber,
    profile,
    phoneVerifiedAt: deps.now(),
  });

  const customToken = await deps.createCustomToken(identity.uid, {
    phone_verified: true,
    sign_in_provider: 'twilio_phone',
  });

  return {
    success: true,
    uid: identity.uid,
    customToken,
    isNewUser: !existingIdentity,
  };
}
