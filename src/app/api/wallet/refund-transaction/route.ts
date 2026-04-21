/**
 * API Route — Rembourser une transaction wallet
 * POST /api/wallet/refund-transaction
 *
 * Body: { originalTransactionId }
 *
 * Crée une transaction "refund" idempotente (id = `refund_<originalId>`) et
 * crédite le wallet du montant remboursé. Idempotent via lecture d'existence
 * dans la même transaction Firestore.
 *
 * @module app/api/wallet/refund-transaction
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import { z } from 'zod';

export const runtime = 'nodejs';

const RefundSchema = z.object({
  originalTransactionId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const body = await request.json();
    const parsed = RefundSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { originalTransactionId } = parsed.data;

    const db = getAdminDb();
    const originalRef = db.collection('transactions').doc(originalTransactionId);
    const walletRef = db.collection('wallets').doc(userId);
    const refundDocId = `refund_${originalTransactionId}`;
    const refundRef = db.collection('transactions').doc(refundDocId);

    await db.runTransaction(async (tx) => {
      const originalSnap = await tx.get(originalRef);
      if (!originalSnap.exists) {
        throw new Error('Transaction originale introuvable');
      }
      const originalData = originalSnap.data()!;

      if (originalData.userId !== userId) {
        throw new Error('Non autorisé : cette transaction ne vous appartient pas');
      }
      if (originalData.status !== 'completed') {
        throw new Error('Seules les transactions complétées peuvent être remboursées');
      }

      const existingRefundSnap = await tx.get(refundRef);
      if (existingRefundSnap.exists) {
        throw new Error('Cette transaction a déjà été remboursée');
      }

      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) {
        throw new Error('Portefeuille introuvable');
      }

      const refundAmount = Math.abs(originalData.amount);

      tx.set(refundRef, {
        id: refundDocId,
        userId,
        type: 'refund',
        amount: refundAmount,
        currency: originalData.currency,
        description: `Remboursement de la transaction ${originalTransactionId}`,
        reference: originalTransactionId,
        status: 'completed',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const currentBalance = walletSnap.data()?.balance ?? 0;
      tx.update(walletRef, {
        balance: currentBalance + refundAmount,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ refundId: refundDocId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[POST /api/wallet/refund-transaction]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    if (message.includes('introuvable') || message.includes('autorisé') || message.includes('complétées') || message.includes('déjà')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}
