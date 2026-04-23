/**
 * API Route — Solde du portefeuille
 *
 * GET /api/wallet/balance
 *
 * Retourne le solde actuel du wallet de l'utilisateur authentifié.
 * Utilisé par le sélecteur de méthode de paiement pour vérifier
 * si le solde est suffisant avant une course.
 *
 * @module app/api/wallet/balance
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import { CURRENCY_CODE } from '@/utils/constants';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const db = getAdminDb();

    const walletSnap = await db.collection('wallets').doc(userId).get();

    if (!walletSnap.exists) {
      return NextResponse.json({ balance: 0, currency: CURRENCY_CODE });
    }

    const data = walletSnap.data()!;
    return NextResponse.json({
      balance: data.balance ?? 0,
      currency: data.currency ?? CURRENCY_CODE,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[GET /api/wallet/balance]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}
