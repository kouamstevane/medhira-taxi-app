/**
 * API Route — Lien d'onboarding Stripe Connect
 * POST /api/stripe/connect/onboard
 * @module app/api/stripe/connect/onboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import { createOnboardingLink } from '@/services/stripe-connect.service';

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const { returnUrl, refreshUrl } = await request.json();

    if (!returnUrl || !refreshUrl) {
      return NextResponse.json({ error: 'returnUrl et refreshUrl sont requis' }, { status: 400 });
    }

    const snap = await getAdminDb().collection('drivers').doc(userId).get();
    const accountId: string | null = snap.data()?.stripeAccountId ?? null;

    if (!accountId) {
      return NextResponse.json(
        { error: 'Aucun compte Stripe Connect. Créez-en un via POST /api/stripe/connect/account' },
        { status: 404 }
      );
    }

    const onboardingUrl = await createOnboardingLink(accountId, returnUrl, refreshUrl);
    return NextResponse.json({ url: onboardingUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne';
    console.error('[POST /api/stripe/connect/onboard]', message);
    const status = message.includes('Token') ? 401 : message === 'SERVICE_UNAVAILABLE' ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
