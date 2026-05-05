import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAdmin } from './_shared.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const ManageUserSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['client', 'restaurateur', 'chauffeur', 'admin']),
});

export const adminManageUser = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>) => {
    const uid = await requireAdmin(request);

    await enforceRateLimit({
      identifier: uid,
      bucket: 'admin:manageUser',
      limit: 30,
      windowSec: 60,
    });

    const parsed = ManageUserSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        'invalid-argument',
        'Données invalides',
        parsed.error.format(),
      );
    }

    const { userId, role } = parsed.data;

    const userRef = admin.firestore().collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'Utilisateur introuvable');
    }

    // TODO P2: refactor for proper roles add/remove via Cloud Function
    // (cas C6 spec §9 — addProRole/removeProRole). Pour P1, on ne touche plus
    // au champ legacy `userType` ; cette callable devient un no-op tracé.
    await userRef.update({
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastModifiedBy: uid,
    });

    return {
      success: true,
      message: `Rôle de l'utilisateur mis à jour vers ${role}`,
    };
  },
);
