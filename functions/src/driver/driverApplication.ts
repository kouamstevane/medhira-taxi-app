import { randomUUID } from 'node:crypto';
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { sendDriverApplicationNotification } from '../email-service.js';
import { requireAdmin } from '../admin/_shared.js';

const resendApiKey = defineSecret('RESEND_API_KEY');
const APPLICATION_EMAIL = 'medjiraservices@gmail.com';
const MAX_CV_SIZE = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] as const;

export const DRIVER_APPLICATION_CALLABLE_OPTIONS = { region: 'europe-west1', cors: true } as const;

export const DriverApplicationSubmissionSchema = z.object({
  applicationId: z.string().regex(/^[a-zA-Z0-9_-]{10,128}$/),
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(6).max(32).optional(),
  city: z.string().trim().min(2).max(100).optional(),
  role: z.enum(['chauffeur', 'livreur', 'les_deux']).optional(),
  fileName: z.string().regex(/^[a-zA-Z0-9._-]{1,120}\.(pdf|docx)$/i),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  size: z.number().int().positive().max(MAX_CV_SIZE),
}).strict();

export type DriverApplicationSubmission = z.infer<typeof DriverApplicationSubmissionSchema>;

export function buildDriverApplicationRecord(
  uid: string,
  input: DriverApplicationSubmission,
  storagePath: string,
  metadata: { size?: string | number; contentType?: string },
) {
  const now = admin.firestore.Timestamp.now();
  return {
    applicantUid: uid,
    ...(input.fullName !== undefined && { fullName: input.fullName }),
    email: input.email.toLowerCase(),
    ...(input.phone !== undefined && { phone: input.phone }),
    ...(input.city !== undefined && { city: input.city }),
    ...(input.role !== undefined && { role: input.role }),
    status: 'pending_review',
    cv: {
      path: storagePath,
      fileName: sanitizeFileName(input.fileName),
      contentType: metadata.contentType,
      size: Number(metadata.size),
    },
    createdAt: now,
    updatedAt: now,
    notifiedEmail: APPLICATION_EMAIL,
  };
}

function sanitizeFileName(fileName: string): string {
  return fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export function buildDriverApplicationStoragePath(uid: string, applicationId: string, fileName: string): string {
  return `driverApplications/${uid}/${applicationId}/cv/${sanitizeFileName(fileName)}`;
}

function requireAnonymousApplicant(request: CallableRequest): string {
  const uid = request.auth?.uid;
  const provider = request.auth?.token.firebase?.sign_in_provider;
  if (!uid || provider !== 'anonymous') {
    throw new HttpsError('unauthenticated', 'Une session temporaire est requise pour envoyer une candidature.');
  }
  return uid;
}

export const createDriverApplicationUpload = onCall(
  DRIVER_APPLICATION_CALLABLE_OPTIONS,
  async (request: CallableRequest) => {
    const uid = requireAnonymousApplicant(request);
    await enforceRateLimit({ identifier: uid, bucket: 'driver:application-upload', limit: 5, windowSec: 3600 });
    const applicationId = randomUUID().replace(/-/g, '');
    return { applicationId };
  },
);

export const submitDriverApplicationWithCv = onCall(
  { ...DRIVER_APPLICATION_CALLABLE_OPTIONS, secrets: [resendApiKey] },
  async (request: CallableRequest) => {
    const uid = requireAnonymousApplicant(request);
    await enforceRateLimit({ identifier: uid, bucket: 'driver:application-submit', limit: 3, windowSec: 3600 });

    const parsed = DriverApplicationSubmissionSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Les informations ou le CV sont invalides.');
    const input = parsed.data;
    if (input.size > MAX_CV_SIZE || !ALLOWED_CONTENT_TYPES.includes(input.contentType)) {
      throw new HttpsError('invalid-argument', 'Le CV doit être un PDF ou un DOCX de 5 Mo maximum.');
    }

    const storagePath = buildDriverApplicationStoragePath(uid, input.applicationId, input.fileName);
    const file = admin.storage().bucket().file(storagePath);
    let metadata: { size?: string | number; contentType?: string };
    let cvBuffer: Buffer;
    try {
      const [fileMetadata] = await file.getMetadata();
      metadata = fileMetadata;
      if (Number(metadata.size ?? 0) !== input.size || metadata.contentType !== input.contentType) {
        throw new HttpsError('invalid-argument', 'Les caractéristiques du fichier ne correspondent pas.');
      }
      [cvBuffer] = await file.download();
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('failed-precondition', 'Le CV doit être téléversé avant l’envoi de la candidature.');
    }

    const db = admin.firestore();
    const applicationRef = db.collection('driverApplications').doc(input.applicationId);
    const existing = await applicationRef.get();
    if (existing.exists) throw new HttpsError('already-exists', 'Cette candidature a déjà été envoyée.');

    await applicationRef.set({
      ...buildDriverApplicationRecord(uid, input, storagePath, metadata),
    });

    try {
      await sendDriverApplicationNotification({
        to: APPLICATION_EMAIL,
        applicationId: input.applicationId,
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        phone: input.phone,
        city: input.city,
        role: input.role,
        fileName: sanitizeFileName(input.fileName),
        cvBuffer,
        apiKey: resendApiKey.value(),
      });
      await applicationRef.update({ notificationStatus: 'sent', updatedAt: admin.firestore.Timestamp.now() });
    } catch (error) {
      console.error('[submitDriverApplicationWithCv] notification failed', error);
      await applicationRef.update({ notificationStatus: 'failed', updatedAt: admin.firestore.Timestamp.now() });
      throw new HttpsError('internal', 'La candidature a été enregistrée, mais la notification n’a pas pu être envoyée.');
    }

    return { success: true, status: 'pending_review' as const };
  },
);

export const adminGetDriverApplicationCv = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest) => {
    await requireAdmin(request);
    const applicationId = z.string().regex(/^[a-zA-Z0-9_-]{10,128}$/).safeParse(request.data?.applicationId);
    if (!applicationId.success) throw new HttpsError('invalid-argument', 'Référence de candidature invalide.');
    const snap = await admin.firestore().collection('driverApplications').doc(applicationId.data).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Candidature introuvable.');
    const path = snap.data()?.cv?.path as string | undefined;
    if (!path) throw new HttpsError('failed-precondition', 'CV introuvable.');
    const [url] = await admin.storage().bucket().file(path).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 15 * 60 * 1000 });
    return { url };
  },
);
