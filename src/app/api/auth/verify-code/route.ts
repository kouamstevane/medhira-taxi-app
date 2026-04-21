// src/app/api/auth/verify-code/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/config/firebase-admin';
import { z } from 'zod';
import * as crypto from 'crypto';
import { timingSafeEqual } from 'crypto';
import * as admin from 'firebase-admin';

export const runtime = 'nodejs';

const VerifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Le code doit contenir exactement 6 chiffres'),
});

export async function POST(request: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ error: 'Firebase Admin SDK non configuré.' }, { status: 503 });
  }

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

  const body = await request.json();
  const result = VerifyCodeSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
  }

  const { code } = result.data;

  const docRef = adminDb.collection('emailVerificationCodes').doc(uid);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return NextResponse.json(
      { error: 'Aucun code en attente. Demandez un nouveau code.' },
      { status: 400 }
    );
  }

  const data = docSnap.data()!;

  const expiresAt: admin.firestore.Timestamp = data.expiresAt;
  if (expiresAt.toMillis() < Date.now()) {
    await docRef.delete();
    return NextResponse.json(
      { error: 'Code expiré. Demandez un nouveau code.' },
      { status: 400 }
    );
  }

  const attempts: number = data.attempts ?? 0;
  if (attempts >= 3) {
    await docRef.delete();
    return NextResponse.json(
      { error: 'Trop de tentatives. Demandez un nouveau code.' },
      { status: 400 }
    );
  }

  const salt: string = data.salt;
  const hashedSubmitted = await new Promise<string>((resolve, reject) =>
    crypto.pbkdf2(code, salt, 100_000, 64, 'sha512', (err, key) =>
      err ? reject(err) : resolve(key.toString('hex'))
    )
  );

  const submitted = Buffer.from(hashedSubmitted, 'hex');
  const stored = Buffer.from(data.code, 'hex');
  if (submitted.length !== stored.length || !timingSafeEqual(submitted, stored)) {
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

  await docRef.delete();

  await adminAuth.updateUser(uid, { emailVerified: true });

  try {
    await adminDb.collection('drivers').doc(uid).update({
      emailVerified: true,
      emailVerifiedAt: admin.firestore.Timestamp.now(),
    });
  } catch (err) {
    console.warn('[verify-code] Mise à jour drivers échouée (doc probablement inexistant):', err);
  }

  try {
    await adminDb.collection('users').doc(uid).update({
      emailVerified: true,
      emailVerifiedAt: admin.firestore.Timestamp.now(),
    });
  } catch (err) {
    console.warn('[verify-code] Mise à jour users échouée (doc probablement inexistant):', err);
  }

  return NextResponse.json({ success: true });
}