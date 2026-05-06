import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAdmin } from './_shared.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const ManageUserSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(['add_role', 'remove_role']),
  role: z.enum(['driver', 'restaurant']),
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

    const { userId, action, role } = parsed.data;

    const userRef = admin.firestore().collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'Utilisateur introuvable');
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    if (action === 'add_role') {
      if (role === 'driver') {
        await userRef.set({
          roles: { driver: { joinedAt: now } },
          updatedAt: now,
          lastModifiedBy: uid,
        }, { merge: true });
      } else if (role === 'restaurant') {
        throw new HttpsError(
          'failed-precondition',
          'Pour ajouter le rôle restaurant, utilisez adminManageRestaurant (approve).',
        );
      }
      return { success: true, message: `Rôle ${role} ajouté à l'utilisateur` };
    }

    if (action === 'remove_role') {
      const userData = userDoc.data()!;
      const update: Record<string, unknown> = {
        updatedAt: now,
        lastModifiedBy: uid,
      };

      if (role === 'driver') {
        update['roles.driver'] = admin.firestore.FieldValue.delete();
        if (userData.activeRole === 'driver') {
          update.activeRole = 'client';
        }
        if (userData.lastActiveRole === 'driver') {
          update.lastActiveRole = userData.roles?.restaurant ? 'restaurant' : 'client';
        }
      } else if (role === 'restaurant') {
        update['roles.restaurant'] = admin.firestore.FieldValue.delete();
        if (userData.activeRole === 'restaurant') {
          update.activeRole = 'client';
        }
        if (userData.lastActiveRole === 'restaurant') {
          update.lastActiveRole = userData.roles?.driver ? 'driver' : 'client';
        }
      }

      await userRef.update(update);
      return { success: true, message: `Rôle ${role} retiré de l'utilisateur` };
    }

    throw new HttpsError('invalid-argument', 'Action non supportée');
  },
);
