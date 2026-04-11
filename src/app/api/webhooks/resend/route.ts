// src/app/api/webhooks/resend/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/config/firebase-admin';
import { Resend } from 'resend';
import type { WebhookEventPayload } from 'resend';
import * as admin from 'firebase-admin';

export const runtime = 'nodejs';

function eventTypeToStatus(type: string): string {
  const map: Record<string, string> = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.delivery_delayed': 'delayed',
    'email.complained': 'complained',
    'email.bounced': 'bounced',
    'email.failed': 'failed',
  };
  return map[type] ?? 'unknown';
}

export async function POST(request: NextRequest) {
  if (!adminDb) {
    return NextResponse.json({ error: 'Firebase Admin SDK non configuré.' }, { status: 503 });
  }

  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[webhook/resend] RESEND_WEBHOOK_SECRET manquant');
    return NextResponse.json({ error: 'Configuration manquante.' }, { status: 503 });
  }

  // Lire le body brut pour la validation de signature
  const rawBody = await request.text();

  // Valider la signature via le SDK Resend
  const resend = new Resend();
  let payload: WebhookEventPayload;
  try {
    payload = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: request.headers.get('svix-id') as string,
        timestamp: request.headers.get('svix-timestamp') as string,
        signature: request.headers.get('svix-signature') as string,
      },
      webhookSecret,
    }) as WebhookEventPayload;
  } catch {
    console.error('[webhook/resend] Signature invalide');
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 401 });
  }

  const { type, data } = payload;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyData = data as any;
  const messageId = anyData.email_id as string | undefined;
  const now = admin.firestore.Timestamp.now();

  if (!messageId) {
    return NextResponse.json({ received: true });
  }

  const docRef = adminDb.collection('emailLogs').doc(messageId);
  const docSnap = await docRef.get();

  // Si le document n'existe pas, on crée un document minimal.
  if (!docSnap.exists) {
    await docRef.set({
      messageId,
      status: eventTypeToStatus(type),
      to: anyData.to?.[0] ?? '',
      subject: anyData.subject ?? '',
      type: anyData.tags?.type ?? 'unknown',
      uid: anyData.tags?.uid ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Mise à jour selon l'événement
  const update: Record<string, unknown> = { updatedAt: now, status: eventTypeToStatus(type) };

  switch (type) {
    case 'email.delivered':
      update.deliveredAt = now;
      break;
    case 'email.delivery_delayed':
      update.delayedAt = now;
      break;
    case 'email.bounced':
      update.bouncedAt = now;
      update.reason = anyData.bounce?.message ?? 'Inconnu';
      break;
    case 'email.failed':
      update.failedAt = now;
      update.reason = anyData.failed?.reason ?? 'Inconnu';
      break;
    case 'email.complained':
      update.complainedAt = now;
      // Créer une alerte admin
      await adminDb.collection('adminAlerts').add({
        type: 'email_complaint',
        messageId,
        uid: anyData.tags?.uid ?? null,
        to: anyData.to?.[0] ?? '',
        createdAt: now,
      });
      break;
  }

  await docRef.update(update);

  // Toujours retourner 200 — Resend ne re-tentera pas autrement
  return NextResponse.json({ received: true });
}
