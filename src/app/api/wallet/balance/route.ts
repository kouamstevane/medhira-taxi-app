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

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const db = getAdminDb();

    const walletSnap = await db.collection('wallets').doc(userId).get();

    if (!walletSnap.exists) {
      return NextResponse.json({ balance: 0, currency: 'CAD' });
    }

    const data = walletSnap.data()!;
    return NextResponse.json({
      balance: data.balance ?? 0,
      currency: data.currency ?? 'CAD',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne';
    console.error('[GET /api/wallet/balance]', message);
    const status = message.includes('Token') ? 401 : message === 'SERVICE_UNAVAILABLE' ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
