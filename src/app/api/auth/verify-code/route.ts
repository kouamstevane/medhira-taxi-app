// src/app/api/auth/verify-code/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/config/firebase-admin';
import { z } from 'zod';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';

export const runtime = 'nodejs';

const VerifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Le code doit contenir exactement 6 chiffres'),
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
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token invalide ou expiré.' }, { status: 401 });
  }

  // Validation
  const body = await request.json();
  const result = VerifyCodeSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
  }

  const { code } = result.data;

  // Lire le document Firestore
  const docRef = adminDb.collection('emailVerificationCodes').doc(uid);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return NextResponse.json(
      { error: 'Aucun code en attente. Demandez un nouveau code.' },
      { status: 400 }
    );
  }

  const data = docSnap.data()!;

  // Vérifier l'expiration
  const expiresAt: admin.firestore.Timestamp = data.expiresAt;
  if (expiresAt.toMillis() < Date.now()) {
    await docRef.delete();
    return NextResponse.json(
      { error: 'Code expiré. Demandez un nouveau code.' },
      { status: 400 }
    );
  }

  // Vérifier les tentatives
  const attempts: number = data.attempts ?? 0;
  if (attempts >= 3) {
    await docRef.delete();
    return NextResponse.json(
      { error: 'Trop de tentatives. Demandez un nouveau code.' },
      { status: 400 }
    );
  }

  // Comparer le code (SHA-256)
  const hashedSubmitted = crypto.createHash('sha256').update(code).digest('hex');
  if (hashedSubmitted !== data.code) {
    const newAttempts = attempts + 1;
    if (newAttempts >= 3) {
      await docRef.delete();
      return NextResponse.json(
        { success: false, error: 'Code incorrect. Trop de tentatives. Demandez un nouveau code.', attemptsLeft: 0 },
        { status: 400 }
      );
    }
    await docRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
    return NextResponse.json(
      { success: false, error: 'Code incorrect.', attemptsLeft: 3 - newAttempts },
      { status: 400 }
    );
  }

  // Succès
  await docRef.delete();

  // Mettre à jour Firebase Auth
  await adminAuth.updateUser(uid, { emailVerified: true });

  // Mettre à jour Firestore drivers (ignore si le doc n'existe pas encore)
  try {
    await adminDb.collection('drivers').doc(uid).update({
      emailVerified: true,
      emailVerifiedAt: admin.firestore.Timestamp.now(),
    });
  } catch {
    // Document drivers pas encore créé — ignoré, Firebase Auth est la source de vérité
  }

  return NextResponse.json({ success: true });
}
