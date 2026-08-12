import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAdmin } from './_shared.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { sendRestaurantStatusEmail } from '../email-service.js';

const resendApiKey = defineSecret('RESEND_API_KEY');

export const ManageRestaurantSchema = z.object({
  action: z.enum(['approve', 'reject', 'suspend', 'unsuspend']),
  restaurantId: z.string().min(1),
  reason: z.string().optional().nullable(),
});

export const adminManageRestaurant = onCall(
  { region: 'europe-west1', secrets: [resendApiKey] },
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

    const firestore = admin.firestore();
    const restaurantRef = firestore
      .collection('restaurants')
      .doc(restaurantId);
    const restaurantDoc = await restaurantRef.get();

    if (!restaurantDoc.exists) {
      throw new HttpsError('not-found', 'Restaurant introuvable');
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const restaurantData = restaurantDoc.data();
    const ownerId = restaurantData?.ownerId as string | undefined;
    let ownerEmail = restaurantData?.ownerEmail as string | undefined;
    const restaurantName = (restaurantData?.name as string | undefined) || 'Restaurant';

    switch (action) {
      case 'approve':
        try {
          await firestore.runTransaction(async (transaction) => {
            transaction.update(restaurantRef, {
              status: 'approved',
              approvedAt: now,
              approvedBy: uid,
              updatedAt: now,
            });

            if (ownerId) {
              transaction.update(firestore.collection('users').doc(ownerId), {
                'roles.restaurant': { restaurantId, joinedAt: now },
                activeRole: 'restaurant',
                lastActiveRole: 'restaurant',
                updatedAt: now,
              });
            }
          });
        } catch (error) {
          console.error('[adminManageRestaurant] Failed to commit restaurant approval', {
            restaurantId,
            ownerId,
            error,
          });
          throw new HttpsError(
            'internal',
            'L\'approbation du restaurant n\'a pas pu être finalisée',
          );
        }

        if (!ownerEmail && ownerId) {
          try {
            const ownerDoc = await firestore.collection('users').doc(ownerId).get();
            const fallbackEmail = ownerDoc.data()?.email;
            if (typeof fallbackEmail === 'string' && fallbackEmail.trim()) {
              ownerEmail = fallbackEmail.trim();
            }
          } catch (error) {
            console.warn('[adminManageRestaurant] Failed to load owner email fallback', {
              ownerId,
              error,
            });
          }
        }

        let emailSent = false;
        if (ownerEmail) {
          try {
            await sendRestaurantStatusEmail({
              to: ownerEmail,
              restaurantName,
              type: 'approval',
              apiKey: resendApiKey.value(),
            });
            emailSent = true;
          } catch (error) {
            console.error('[adminManageRestaurant] Failed to send approval email', {
              restaurantId,
              ownerEmail,
              error,
            });
          }
        }
        return {
          success: true,
          emailSent,
          message: emailSent
            ? 'Restaurant approuvé avec succès'
            : 'Restaurant approuvé, mais l\'email de notification n\'a pas pu être envoyé',
        };

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
