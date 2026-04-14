// src/app/api/auth/send-verification-code/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/config/firebase-admin';
import { sendVerificationCodeEmail } from '@/lib/email-service';
import { z } from 'zod';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';

export const runtime = 'nodejs';

const SendVerificationCodeSchema = z.object({
  email: z.string().email('Adresse email invalide'),
});

export async function POST(request: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ error: 'Firebase Admin SDK non configuré.' }, { status: 503 });
  }

  // Authentification
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  let uid: string;
  let tokenEmail: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
    tokenEmail = decoded.email;
  } catch {
    return NextResponse.json({ error: 'Token invalide ou expiré.' }, { status: 401 });
  }

  // Validation
  const body = await request.json();
  const result = SendVerificationCodeSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
  }

  const { email } = result.data;

  // Sécurité : on n'envoie qu'à sa propre adresse
  if (tokenEmail !== email) {
    return NextResponse.json({ error: 'L\'email ne correspond pas à votre compte.' }, { status: 403 });
  }

  // Rate limiting : 1 renvoi max par minute
  const docRef = adminDb.collection('emailVerificationCodes').doc(uid);
  const existing = await docRef.get();
  if (existing.exists) {
    const data = existing.data()!;
    const resendAt = data.resendAt?.toMillis?.() ?? 0;
    const secondsSinceLastSend = (Date.now() - resendAt) / 1000;
    if (secondsSinceLastSend < 60) {
      const retryAfterSeconds = Math.ceil(60 - secondsSinceLastSend);
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans quelques secondes.', retryAfterSeconds },
        { status: 429 }
      );
    }
  }

  // Générer le code
  const code = String(crypto.randomInt(100000, 1000000));
  const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

  // Envoyer l'email EN PREMIER — écrire en Firestore seulement si l'envoi réussit
  // (évite de bloquer l'utilisateur par le rate limit si Resend est indisponible)
  let messageId: string | undefined;
  try {
    const emailResult = await sendVerificationCodeEmail({ to: email, code, uid });
    messageId = emailResult.messageId;
  } catch (err: unknown) {
    console.error('[send-verification-code] Erreur Resend:', err);
    return NextResponse.json(
      { error: 'Erreur lors de l\'envoi de l\'email. Réessayez.' },
      { status: 500 }
    );
  }

  // Stocker en Firestore uniquement après un envoi réussi
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
  await docRef.set({
    code: hashedCode,
    email,
    expiresAt,
    attempts: 0,
    createdAt: now,
    resendAt: now,
  });

  // Créer le log d'email pour le webhook
  if (messageId) {
    await adminDb.collection('emailLogs').doc(messageId).set({
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

  return NextResponse.json({ success: true });
}
