import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { settleWaitTimeOverage, stripeSecretKey } from './settleWaitTimeOverage.js';

const inputSchema = z.object({ tripId: z.string().trim().min(1) }).strict();

export const chargePersonalDriverWaitTimeOverage = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey] },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise.');
    const parsed = inputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    return settleWaitTimeOverage({ tripId: parsed.data.tripId, actor: 'manual', actorUid: request.auth.uid });
  },
);
