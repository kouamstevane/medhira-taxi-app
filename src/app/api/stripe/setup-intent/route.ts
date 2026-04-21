/**
 * API Route — Stripe SetupIntent (sauvegarde carte bancaire)
 *
 * Le SetupIntent est confirmé côté client via Stripe.js (confirmSetup).
 * La création du SetupIntent est gérée par la Callable Function createSetupIntent.
 * Cette route PUT est un fallback pour persister le payment_method dans
 * Firestore après confirmation côté client (si webhook non configuré).
 *
 * @module app/api/stripe/setup-intent
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import stripe from '@/lib/stripe';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

const SetupIntentSchema = z.object({
  setupIntentId: z.string().regex(/^seti_[a-zA-Z0-9]+$/, 'Format setupIntentId invalide'),
});

// ============================================================================
// PUT — Confirmer la sauvegarde du payment_method (fallback client-side)
// ============================================================================

export async function PUT(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const body = await request.json();
    const parsed = SetupIntentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { setupIntentId } = parsed.data;

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

    if (setupIntent.status !== 'succeeded') {
      return NextResponse.json(
        { error: 'Le SetupIntent n\'est pas confirmé' },
        { status: 400 }
      );
    }

    if (setupIntent.metadata?.userId !== userId) {
      return NextResponse.json(
        { error: 'Accès refusé' },
        { status: 403 }
      );
    }

    const paymentMethodId = setupIntent.payment_method;
    if (typeof paymentMethodId !== 'string' || !paymentMethodId) {
      return NextResponse.json(
        { error: 'Payment method invalide' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    await db.collection('users').doc(userId).update({
      defaultPaymentMethodId: paymentMethodId,
      setupIntentId: setupIntentId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, paymentMethodId }, { status: 200 });
  } catch (err) {
    console.error('[PUT /api/stripe/setup-intent]', err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Une erreur est survenue. Veuillez réessayer.' },
      { status: 500 }
    );
  }
}