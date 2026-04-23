/**
 * API Route — Payer une course / commande avec le wallet
 * POST /api/wallet/pay-booking
 *
 * Body: { bookingId }
 *
 * Le montant débité est TOUJOURS lu depuis le document booking côté serveur
 * (jamais depuis le body), et l'appartenance du booking est vérifiée avant
 * débit (cf. C-SEC-05).
 *
 * Crée la transaction "completed" et débite le wallet dans une même transaction
 * Firestore pour éviter les doubles débits et soldes négatifs.
 *
 * @module app/api/wallet/pay-booking
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import { CURRENCY_CODE, DEFAULT_PRICING } from '@/utils/constants';
import { z } from 'zod';

export const runtime = 'nodejs';

const MAX_PAY_AMOUNT = 100_000;
const MIN_RIDE_PRICE = Math.max(1, DEFAULT_PRICING.BASE_PRICE > 0 ? DEFAULT_PRICING.BASE_PRICE * 0.5 : 1);

const PaySchema = z.object({
  bookingId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const body = await request.json();
    const parsed = PaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { bookingId } = parsed.data;

    const db = getAdminDb();
    const walletRef = db.collection('wallets').doc(userId);
    const bookingRef = db.collection('bookings').doc(bookingId);
    const transactionRef = db.collection('transactions').doc();
    const transactionId = transactionRef.id;

    await db.runTransaction(async (tx) => {
      // 1. Lire le booking et vérifier ownership + prix côté serveur
      const bookingDoc = await tx.get(bookingRef);
      if (!bookingDoc.exists) {
        throw new Error('Réservation introuvable');
      }
      const booking = bookingDoc.data()!;

      if (booking.userId !== userId) {
        throw new Error('Non autorisé : cette réservation ne vous appartient pas');
      }

      if (booking.paymentStatus === 'paid' || booking.status === 'paid') {
        throw new Error('Réservation déjà payée');
      }

      const amount = booking.price;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < MIN_RIDE_PRICE || amount > MAX_PAY_AMOUNT) {
        throw new Error('Montant de réservation invalide');
      }

      // 2. Vérifier le solde
      const walletDoc = await tx.get(walletRef);
      if (!walletDoc.exists) {
        throw new Error('Portefeuille introuvable');
      }
      const currentBalance = walletDoc.data()?.balance ?? 0;
      if (currentBalance < amount) {
        throw new Error('Solde insuffisant');
      }

      // 3. Créer la transaction, débiter le wallet, marquer la réservation payée
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

      tx.update(bookingRef, {
        paymentStatus: 'paid',
        paymentTransactionId: transactionId,
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
    if (
      message.includes('Solde insuffisant') ||
      message.includes('introuvable') ||
      message.includes('autorisé') ||
      message.includes('invalide') ||
      message.includes('déjà payée')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}
