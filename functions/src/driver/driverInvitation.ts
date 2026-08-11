import { createHash, randomBytes } from 'node:crypto';
import { defineSecret } from 'firebase-functions/params';
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAdmin } from '../admin/_shared.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { sendDriverInvitationEmail } from '../email-service.js';

const resendApiKey = defineSecret('RESEND_API_KEY');
const ROLE_VALUES = ['chauffeur', 'livreur', 'les_deux'] as const;
const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

const CreateSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(ROLE_VALUES),
  applicantName: z.string().trim().max(120).nullable().optional(),
  adminNote: z.string().trim().max(1000).optional(),
});
const ValidateSchema = z.object({
  invitationId: z.string().trim().min(8).max(128),
  email: z.string().trim().email().max(254),
  code: z.string().trim().regex(/^[A-Z0-9-]{8,32}$/),
});

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function hashCode(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function readInvitation(data: FirebaseFirestore.DocumentData | undefined): FirebaseFirestore.DocumentData & { expiresAt: admin.firestore.Timestamp } {
  if (!data) throw new HttpsError('not-found', 'Invitation introuvable ou invalide.');
  const expiresAt = data.expiresAt as admin.firestore.Timestamp;
  if (data.status !== 'active' || !expiresAt || expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError('deadline-exceeded', 'Cette invitation a expiré ou n’est plus disponible.');
  }
  return { ...data, expiresAt };
}

export const adminCreateDriverInvitation = onCall(
  { region: 'europe-west1', secrets: [resendApiKey] },
  async (request: CallableRequest<unknown>) => {
    const adminUid = await requireAdmin(request);
    await enforceRateLimit({ identifier: adminUid, bucket: 'admin:createDriverInvitation', limit: 20, windowSec: 60 });
    const parsed = CreateSchema.safeParse(request.data);
    if (!parsed.success) {
      console.error('[adminCreateDriverInvitation] invalid payload', {
        keys: request.data && typeof request.data === 'object' ? Object.keys(request.data) : [],
        fieldTypes: request.data && typeof request.data === 'object'
          ? Object.fromEntries(Object.entries(request.data).map(([key, value]) => [key, typeof value]))
          : typeof request.data,
        issues: parsed.error.issues.map(({ path, code }) => ({ path, code })),
      });
      throw new HttpsError('invalid-argument', 'Email, poste ou données invalides.');
    }

    const input = parsed.data;
    const email = normalizeEmail(input.email);
    const code = generateCode();
    const salt = randomBytes(16).toString('hex');
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + INVITATION_TTL_MS);
    const ref = admin.firestore().collection('driverInvitations').doc();

    let messageId: string | undefined;
    try {
      const sent = await sendDriverInvitationEmail({
        to: email,
        code,
        expiresAt: expiresAt.toDate(),
        role: input.role,
        invitationId: ref.id,
        apiKey: resendApiKey.value(),
      });
      messageId = sent.messageId;
    } catch (error) {
      console.error('[adminCreateDriverInvitation] email failed', error);
      throw new HttpsError('internal', 'L’email d’invitation n’a pas pu être envoyé.');
    }

    await ref.set({
      email,
      role: input.role,
      applicantName: input.applicantName || null,
      adminNote: input.adminNote || null,
      codeHash: hashCode(code, salt),
      codeSalt: salt,
      status: 'active',
      expiresAt,
      createdAt: now,
      createdBy: adminUid,
      emailMessageId: messageId || null,
    });
    return { success: true, invitationId: ref.id, code, expiresAt: expiresAt.toMillis() };
  },
);

export const validateDriverInvitation = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>) => {
    const parsed = ValidateSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Invitation invalide.');
    const input = parsed.data;
    const ref = admin.firestore().collection('driverInvitations').doc(input.invitationId);
    const snap = await ref.get();
    const invitation = readInvitation(snap.data());
    if (invitation.email !== normalizeEmail(input.email)) throw new HttpsError('permission-denied', 'Email ou code invalide.');
    if (hashCode(input.code.toUpperCase(), invitation.codeSalt) !== invitation.codeHash) {
      throw new HttpsError('permission-denied', 'Email ou code invalide.');
    }
    return { success: true, role: invitation.role, expiresAt: invitation.expiresAt.toMillis() };
  },
);

export const completeDriverInvitation = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth?.uid || !request.auth.token.email) throw new HttpsError('unauthenticated', 'Authentification requise.');
    const parsed = ValidateSchema.pick({ invitationId: true, code: true }).safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Invitation invalide.');
    const uid = request.auth.uid;
    const email = normalizeEmail(request.auth.token.email);
    const db = admin.firestore();
    const invitationRef = db.collection('driverInvitations').doc(parsed.data.invitationId);
    const userRef = db.collection('users').doc(uid);
    await db.runTransaction(async (tx) => {
      const [invitationSnap, userSnap] = await Promise.all([tx.get(invitationRef), tx.get(userRef)]);
      const invitation = readInvitation(invitationSnap.data());
      if (invitation.email !== email) throw new HttpsError('permission-denied', 'Cette adresse email ne correspond pas à l’invitation.');
      if (hashCode(parsed.data.code.toUpperCase(), invitation.codeSalt) !== invitation.codeHash) {
        throw new HttpsError('permission-denied', 'Code d’invitation invalide.');
      }
      if (userSnap.exists) {
        const existingData = userSnap.data() ?? {};
        const existingRoles = existingData.roles ?? {};
        const isIncompleteRolelessAccount =
          Object.keys(existingRoles).length === 0
          && (existingData.accountState == null || existingData.accountState === 'driver_onboarding');

        if (!isIncompleteRolelessAccount) {
          throw new HttpsError('already-exists', 'Ce compte existe déjà.');
        }
      }
      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.set(userRef, { uid, email, phoneNumber: null, roles: {}, activeRole: 'driver_onboarding', accountState: 'driver_onboarding', onboarding: { driver: { status: 'draft', currentStep: 1, invitationId: invitationRef.id, driverType: invitation.role, startedAt: now, updatedAt: now } }, updatedAt: now, createdAt: userSnap.exists ? userSnap.data()?.createdAt : now }, { merge: true });
      tx.update(invitationRef, { status: 'used', usedAt: now, usedBy: uid });
    });
    return { success: true };
  },
);
