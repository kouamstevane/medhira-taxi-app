/**
 * Service SMS via Twilio.
 *
 * Secrets requis (Firebase Secret Manager) :
 *   - TWILIO_ACCOUNT_SID
 *   - TWILIO_AUTH_TOKEN
 *   - TWILIO_FROM_NUMBER (numéro E.164 expéditeur, ex: +14155551234)
 *
 * Toute fonction qui importe sendSms doit déclarer ces 3 secrets dans
 * son option `secrets: [...]` pour que les valeurs soient injectées.
 */

import { defineSecret } from 'firebase-functions/params';

export const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
export const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');
export const twilioFromNumber = defineSecret('TWILIO_FROM_NUMBER');

let _client: any = null;

async function getClient() {
  if (_client) return _client;
  const sid = twilioAccountSid.value();
  const token = twilioAuthToken.value();
  if (!sid || !token) {
    throw new Error('Twilio credentials manquants (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)');
  }
  const twilio = (await import('twilio')).default;
  _client = twilio(sid, token);
  return _client;
}

/**
 * Normalise un numéro vers le format E.164 :
 * - retire espaces, tirets, parenthèses, points
 * - garde le `+` initial si présent
 * - sinon, retourne tel quel (Twilio rejettera si invalide)
 */
export function normalizePhone(raw: string): string {
  if (!raw) return raw;
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  return hasPlus ? `+${digits}` : digits;
}

export interface SendSmsParams {
  to: string;
  body: string;
}

export interface SendSmsResult {
  success: boolean;
  sid?: string;
  error?: string;
}

/**
 * Envoie un SMS via Twilio. N'échoue pas en cas d'erreur Twilio :
 * retourne `{ success: false, error }` pour permettre aux callers de logger
 * sans interrompre un flux métier (ex: changement de statut booking).
 */
export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  const to = normalizePhone(params.to);
  if (!to || to.replace(/\D/g, '').length < 8) {
    return { success: false, error: 'Numéro destinataire invalide' };
  }

  const from = twilioFromNumber.value();
  if (!from) {
    return { success: false, error: 'TWILIO_FROM_NUMBER non configuré' };
  }

  try {
    const client = await getClient();
    const message = await client.messages.create({
      from,
      to,
      body: params.body,
    });
    return { success: true, sid: message.sid };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMessage };
  }
}
