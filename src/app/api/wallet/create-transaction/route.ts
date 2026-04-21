/**
 * API Route — Créer une transaction wallet (en statut "pending")
 * POST /api/wallet/create-transaction
 *
 * Body: { type, amount, currency, description?, reference?, bookingId?, method?, fees?, netAmount? }
 *
 * @module app/api/wallet/create-transaction
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import { z } from 'zod';

export const runtime = 'nodejs';

const CreateTransactionSchema = z.object({
  type: z.enum(['deposit', 'withdrawal', 'payment', 'refund']),
  amount: z.number().finite(),
  currency: z.string().min(1),
  description: z.string().optional(),
  reference: z.string().optional(),
  bookingId: z.string().optional(),
  method: z.enum(['visa', 'mastercard', 'stripe_card']).optional(),
  fees: z.number().optional(),
  netAmount: z.number().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const body = await request.json();
    const parsed = CreateTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const db = getAdminDb();
    const transactionsRef = db.collection('transactions');
    const newRef = transactionsRef.doc();

    const payload: Record<string, unknown> = {
      ...parsed.data,
      id: newRef.id,
      userId,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await newRef.set(payload);

    return NextResponse.json({ transactionId: newRef.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[POST /api/wallet/create-transaction]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}
