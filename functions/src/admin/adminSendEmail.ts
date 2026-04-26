import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { z } from 'zod';
import { requireAdmin } from './_shared.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { sendDriverStatusEmail } from '../email-service.js';

const resendApiKey = defineSecret('RESEND_API_KEY');

const EmailPayloadSchema = z.object({
  to: z.string().email(),
  type: z.enum([
    'approval',
    'rejection',
    'suspension',
    'deactivation',
    'reactivation',
  ]),
  driverName: z.string().min(1),
  reason: z.string().optional(),
});

export const adminSendEmail = onCall(
  { region: 'europe-west1', secrets: [resendApiKey] },
  async (request: CallableRequest<unknown>) => {
    const uid = await requireAdmin(request);

    await enforceRateLimit({
      identifier: uid,
      bucket: 'admin:sendEmail',
      limit: 20,
      windowSec: 60,
    });

    const parsed = EmailPayloadSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        'invalid-argument',
        'Données invalides',
        parsed.error.format(),
      );
    }

    const { to, type, driverName, reason } = parsed.data;

    try {
      const info = await sendDriverStatusEmail({
        to,
        driverName,
        type,
        reason,
        apiKey: resendApiKey.value(),
      });

      console.log('[adminSendEmail] Email envoyé:', {
        messageId: info.messageId,
        to,
        type,
      });

      return {
        success: true,
        message: 'Email envoyé avec succès',
        messageId: info.messageId,
      };
    } catch (err) {
      console.error('[adminSendEmail] Erreur:', err);
      throw new HttpsError('internal', "Erreur lors de l'envoi de l'email");
    }
  },
);
