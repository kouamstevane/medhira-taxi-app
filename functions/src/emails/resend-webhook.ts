/**
 * Cloud Function — Webhook Resend
 *
 * resendWebhook : tracking des événements d'envoi d'emails
 *   URL : https://europe-west1-medjira-service.cloudfunctions.net/resendWebhook
 *
 * Événements traités :
 *   - email.sent, email.delivered, email.delivery_delayed
 *   - email.bounced, email.failed, email.complained
 *
 * Secrets requis (Firebase Secret Manager) :
 *   - RESEND_WEBHOOK_SECRET
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import type { WebhookEventPayload } from 'resend';

// ── Secret ─────────────────────────────────────────────────────────────────
const resendWebhookSecret = defineSecret('RESEND_WEBHOOK_SECRET');

// ── Firebase Admin guard ───────────────────────────────────────────────────
function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

// ── Mapping type → statut ──────────────────────────────────────────────────
function eventTypeToStatus(type: string): string {
  const map: Record<string, string> = {
    'email.sent':             'sent',
    'email.delivered':        'delivered',
    'email.delivery_delayed': 'delayed',
    'email.complained':       'complained',
    'email.bounced':          'bounced',
    'email.failed':           'failed',
  };
  return map[type] ?? 'unknown';
}

// =============================================================================
// resendWebhook
// =============================================================================

export const resendWebhook = onRequest(
  {
    region: 'europe-west1',
    secrets: [resendWebhookSecret],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Valider la signature via le SDK Resend (utilise Svix en interne)
    // La clé API n'est pas nécessaire pour verify() — on passe un placeholder
    const resend = new Resend('unused');
    let payload: WebhookEventPayload;
    try {
      // req.rawBody est injecté automatiquement par Firebase Functions
      const rawBody = req.rawBody?.toString('utf8') ?? '';
      payload = resend.webhooks.verify({
        payload: rawBody,
        headers: {
          id:        req.headers['svix-id'] as string,
          timestamp: req.headers['svix-timestamp'] as string,
          signature: req.headers['svix-signature'] as string,
        },
        webhookSecret: resendWebhookSecret.value(),
      }) as WebhookEventPayload;
    } catch {
      console.error('[resendWebhook] Signature invalide');
      res.status(401).json({ error: 'Signature invalide.' });
      return;
    }

    const { type, data } = payload;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyData = data as any;
    const messageId = anyData.email_id as string | undefined;
    const now = admin.firestore.Timestamp.now();

    console.log(`[resendWebhook] ${type} — messageId: ${messageId ?? 'none'}`);

    if (!messageId) {
      res.json({ received: true });
      return;
    }

    const db = getDb();
    const docRef = db.collection('emailLogs').doc(messageId);
    const docSnap = await docRef.get();

    // Créer un document minimal si inexistant
    if (!docSnap.exists) {
      await docRef.set({
        messageId,
        status:    eventTypeToStatus(type),
        to:        anyData.to?.[0] ?? '',
        subject:   anyData.subject ?? '',
        type:      anyData.tags?.type ?? 'unknown',
        uid:       anyData.tags?.uid ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Mise à jour selon l'événement
    const update: Record<string, unknown> = {
      updatedAt: now,
      status:    eventTypeToStatus(type),
    };

    switch (type) {
      case 'email.delivered':
        update.deliveredAt = now;
        break;
      case 'email.delivery_delayed':
        update.delayedAt = now;
        break;
      case 'email.bounced':
        update.bouncedAt = now;
        update.reason    = anyData.bounce?.message ?? 'Inconnu';
        break;
      case 'email.failed':
        update.failedAt = now;
        update.reason   = anyData.failed?.reason ?? 'Inconnu';
        break;
      case 'email.complained':
        update.complainedAt = now;
        // Alerte admin
        await db.collection('adminAlerts').add({
          type:      'email_complaint',
          messageId,
          uid:       anyData.tags?.uid ?? null,
          to:        anyData.to?.[0] ?? '',
          createdAt: now,
        });
        break;
    }

    await docRef.update(update);

    // Toujours retourner 200 — Resend ne re-tentera pas autrement
    res.json({ received: true });
  },
);
