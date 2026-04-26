import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAdmin } from './_shared.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { deleteDriverCompletely } from './driverDeletion.js';

const DeleteDriverCompleteSchema = z.object({
  driverId: z.string().min(1, "L'ID du chauffeur est requis"),
});

export const adminDeleteDriverComplete = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>) => {
    const uid = await requireAdmin(request);

    await enforceRateLimit({
      identifier: uid,
      bucket: 'admin:deleteDriverComplete',
      limit: 5,
      windowSec: 60,
    });

    const parsed = DeleteDriverCompleteSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Données invalides', parsed.error.format());
    }
    const { driverId } = parsed.data;

    const driverDoc = await admin.firestore().collection('drivers').doc(driverId).get();
    if (!driverDoc.exists) {
      throw new HttpsError('not-found', 'Chauffeur introuvable');
    }

    try {
      const result = await deleteDriverCompletely(driverId, uid);
      return {
        ...result,
        success: true,
        message: 'Chauffeur supprimé définitivement avec succès',
      };
    } catch (err) {
      console.error('[adminDeleteDriverComplete] Erreur:', err);
      throw new HttpsError('internal', 'Erreur lors de la suppression');
    }
  },
);
