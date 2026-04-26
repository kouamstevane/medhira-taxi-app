import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAdmin } from './_shared.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const ManageRestaurantSchema = z.object({
  action: z.enum(['approve', 'reject', 'suspend', 'unsuspend']),
  restaurantId: z.string().min(1),
  reason: z.string().optional(),
});

export const adminManageRestaurant = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>) => {
    const uid = await requireAdmin(request);

    await enforceRateLimit({
      identifier: uid,
      bucket: 'admin:manageRestaurant',
      limit: 30,
      windowSec: 60,
    });

    const parsed = ManageRestaurantSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        'invalid-argument',
        'Données invalides',
        parsed.error.format(),
      );
    }

    const { action, restaurantId, reason } = parsed.data;

    const restaurantRef = admin
      .firestore()
      .collection('restaurants')
      .doc(restaurantId);
    const restaurantDoc = await restaurantRef.get();

    if (!restaurantDoc.exists) {
      throw new HttpsError('not-found', 'Restaurant introuvable');
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const restaurantData = restaurantDoc.data();
    const ownerId = restaurantData?.ownerId as string | undefined;

    switch (action) {
      case 'approve':
        await restaurantRef.update({
          status: 'approved',
          approvedAt: now,
          approvedBy: uid,
          updatedAt: now,
        });
        if (ownerId) {
          try {
            await admin
              .firestore()
              .collection('users')
              .doc(ownerId)
              .update({ userType: 'restaurateur' });
          } catch (e) {
            console.error(
              'Erreur lors de la mise à jour du type utilisateur:',
              e,
            );
          }
        }
        return { success: true, message: 'Restaurant approuvé avec succès' };

      case 'reject':
        if (!reason) {
          throw new HttpsError(
            'invalid-argument',
            'Raison requise pour le refus',
          );
        }
        await restaurantRef.update({
          status: 'rejected',
          rejectionReason: reason,
          rejectedAt: now,
          rejectedBy: uid,
          updatedAt: now,
        });
        return { success: true, message: 'Restaurant refusé' };

      case 'suspend':
        if (!reason) {
          throw new HttpsError(
            'invalid-argument',
            'Raison requise pour la suspension',
          );
        }
        await restaurantRef.update({
          status: 'suspended',
          suspensionReason: reason,
          suspendedAt: now,
          suspendedBy: uid,
          updatedAt: now,
        });
        return { success: true, message: 'Restaurant suspendu' };

      case 'unsuspend':
        await restaurantRef.update({
          status: 'approved',
          suspensionReason: null,
          suspendedAt: null,
          suspendedBy: null,
          updatedAt: now,
        });
        return { success: true, message: 'Restaurant réactivé' };

      default:
        throw new HttpsError('invalid-argument', 'Action non supportée');
    }
  },
);
