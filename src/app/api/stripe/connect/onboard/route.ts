/**
 * API Route — Lien d'onboarding Stripe Connect
 * POST /api/stripe/connect/onboard
 * @module app/api/stripe/connect/onboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import { createOnboardingLink } from '@/services/stripe-connect.service';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);

    const appOrigin = process.env.NEXT_PUBLIC_APP_URL || '';
    if (!appOrigin) {
      return NextResponse.json({ error: 'Configuration serveur incomplète' }, { status: 500 });
    }
    const onboardSchema = z.object({
      returnUrl: z.string().url().refine(url => { try { return new URL(url).origin === appOrigin; } catch { return false; } }, { message: 'returnUrl doit appartenir au domaine de l\'application' }),
      refreshUrl: z.string().url().refine(url => { try { return new URL(url).origin === appOrigin; } catch { return false; } }, { message: 'refreshUrl doit appartenir au domaine de l\'application' })
    });
    const parsed = onboardSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { returnUrl, refreshUrl } = parsed.data;

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
    const message = err instanceof Error ? err.message : '';
    console.error('[POST /api/stripe/connect/onboard]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}
