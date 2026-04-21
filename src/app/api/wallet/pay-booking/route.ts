/**
 * API Route — Payer une course / commande avec le wallet
 * POST /api/wallet/pay-booking
 *
 * Body: { bookingId, amount }
 *
 * Crée la transaction "completed" et débite le wallet dans une même transaction
 * Firestore pour éviter les doubles débits et soldes négatifs.
 *
 * @module app/api/wallet/pay-booking
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import { CURRENCY_CODE } from '@/utils/constants';
import { z } from 'zod';

export const runtime = 'nodejs';

const PaySchema = z.object({
  bookingId: z.string().min(1),
  amount: z.number().finite().positive(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const body = await request.json();
    const parsed = PaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { bookingId, amount } = parsed.data;

    const db = getAdminDb();
    const walletRef = db.collection('wallets').doc(userId);
    const transactionRef = db.collection('transactions').doc();
    const transactionId = transactionRef.id;

    await db.runTransaction(async (tx) => {
      const walletDoc = await tx.get(walletRef);
      if (!walletDoc.exists) {
        throw new Error('Portefeuille introuvable');
      }
      const currentBalance = walletDoc.data()?.balance ?? 0;
      if (currentBalance < amount) {
        throw new Error('Solde insuffisant');
      }

      tx.set(transactionRef, {
        id: transactionId,
        userId,
        type: 'payment',
        amount: -amount,
        currency: CURRENCY_CODE,
        description: 'Paiement de course',
        bookingId,
        status: 'completed',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.update(walletRef, {
        balance: currentBalance - amount,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ transactionId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[POST /api/wallet/pay-booking]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    if (message.includes('Solde insuffisant') || message.includes('introuvable')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}
