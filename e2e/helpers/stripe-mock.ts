import crypto from 'node:crypto';

const STRIPE_MOCK_BASE =
  process.env.STRIPE_MOCK_BASE ?? 'http://localhost:12111';
const TEST_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET_INSTANT ?? 'whsec_test_secret_e2e';
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'medjira-service';
const FUNCTIONS_HOST =
  process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ?? 'localhost:5001';

export const STRIPE_WEBHOOK_URL = `http://${FUNCTIONS_HOST}/${PROJECT_ID}/europe-west1/stripeWebhookInstant`;

export async function createStripeAccount(
  metadata: Record<string, string>,
): Promise<{ id: string }> {
  const res = await fetch(`${STRIPE_MOCK_BASE}/v1/accounts`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer sk_test_mock',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      type: 'express',
      ...Object.fromEntries(
        Object.entries(metadata).map(([k, v]) => [
          `metadata[${k}]`,
          v,
        ]),
      ),
    }),
  });
  if (!res.ok)
    throw new Error(`createStripeAccount failed: ${res.status}`);
  return res.json() as Promise<{ id: string }>;
}

export function signStripeWebhook(
  payload: string,
  secret = TEST_WEBHOOK_SECRET,
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export async function sendStripeWebhook(
  event: {
    type: string;
    data: { object: Record<string, unknown> };
  },
): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify({
    id: `evt_${Date.now()}`,
    type: event.type,
    data: event.data,
    created: Math.floor(Date.now() / 1000),
  });
  const signature = signStripeWebhook(payload);
  const res = await fetch(STRIPE_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'stripe-signature': signature,
      'Content-Type': 'application/json',
    },
    body: payload,
  });
  return { status: res.status, body: await res.text() };
}

export function buildAccountUpdatedEvent(
  accountId: string,
  metadata: Record<string, string>,
  chargesEnabled = true,
): {
  type: string;
  data: { object: Record<string, unknown> };
} {
  return {
    type: 'account.updated',
    data: {
      object: {
        id: accountId,
        object: 'account',
        charges_enabled: chargesEnabled,
        details_submitted: chargesEnabled,
        metadata,
        requirements: { disabled_reason: null, currently_due: [] },
      },
    },
  };
}
