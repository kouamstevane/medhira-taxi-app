/**
 * API Route — Finaliser une transaction et créditer le wallet
 * POST /api/wallet/complete-transaction
 *
 * Body: { transactionId, amount }
 *
 * Idempotent : si la transaction est déjà en statut "completed", retourne 200
 * sans créditer à nouveau le wallet.
 *
 * @module app/api/wallet/complete-transaction
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import { z } from 'zod';

export const runtime = 'nodejs';

const CompleteSchema = z.object({
  transactionId: z.string().min(1),
  amount: z.number().finite(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const body = await request.json();
    const parsed = CompleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { transactionId, amount } = parsed.data;

    const db = getAdminDb();
    const transactionRef = db.collection('transactions').doc(transactionId);
    const walletRef = db.collection('wallets').doc(userId);

    const result = await db.runTransaction(async (tx) => {
      const txDoc = await tx.get(transactionRef);
      if (!txDoc.exists) {
        throw new Error('Transaction introuvable');
      }
      const txData = txDoc.data()!;

      // Vérif d'appartenance : évite qu'un user complète la transaction d'un autre
      if (txData.userId !== userId) {
        throw new Error('Non autorisé : cette transaction ne vous appartient pas');
      }

      // Idempotence : déjà complétée, ne rien faire
      if (txData.status === 'completed') {
        return { alreadyCompleted: true };
      }

      const walletDoc = await tx.get(walletRef);
      if (!walletDoc.exists) {
        throw new Error('Portefeuille introuvable');
      }

      const currentBalance = walletDoc.data()?.balance ?? 0;
      const newBalance = currentBalance + amount;

      tx.update(walletRef, {
        balance: newBalance,
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.update(transactionRef, {
        status: 'completed',
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { alreadyCompleted: false };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[POST /api/wallet/complete-transaction]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    if (message.includes('introuvable') || message.includes('autorisé')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}
