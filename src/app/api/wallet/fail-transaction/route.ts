/**
 * API Route — Marquer une transaction comme échouée
 * POST /api/wallet/fail-transaction
 *
 * Body: { transactionId, reason }
 *
 * @module app/api/wallet/fail-transaction
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import { z } from 'zod';

export const runtime = 'nodejs';

const FailSchema = z.object({
  transactionId: z.string().min(1),
  reason: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const body = await request.json();
    const parsed = FailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { transactionId, reason } = parsed.data;

    const db = getAdminDb();
    const transactionRef = db.collection('transactions').doc(transactionId);

    const snap = await transactionRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Transaction introuvable' }, { status: 404 });
    }
    if (snap.data()?.userId !== userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    await transactionRef.update({
      status: 'failed',
      failureReason: reason,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[POST /api/wallet/fail-transaction]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}
