/**
 * API Route — Créer le wallet de l'utilisateur authentifié s'il n'existe pas
 * POST /api/wallet/ensure
 *
 * Retourne { balance, currency } — équivalent serveur de getOrCreateWallet.
 * Les clients doivent appeler cette route avant de lire directement le wallet
 * via Firestore (les rules étant read-only pour les clients).
 *
 * @module app/api/wallet/ensure
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import { CURRENCY_CODE } from '@/utils/constants';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const db = getAdminDb();
    const walletRef = db.collection('wallets').doc(userId);

    const snap = await walletRef.get();
    if (snap.exists) {
      const data = snap.data()!;
      return NextResponse.json({
        userId,
        balance: data.balance ?? 0,
        currency: data.currency ?? CURRENCY_CODE,
      });
    }

    await walletRef.set({
      userId,
      balance: 0,
      currency: CURRENCY_CODE,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      userId,
      balance: 0,
      currency: CURRENCY_CODE,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[POST /api/wallet/ensure]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}
