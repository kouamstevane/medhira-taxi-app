import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { SubmitRestaurantApplicationRequestSchema } from '../validators/schemas.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';

export const submitRestaurantApplication = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    const uid = request.auth.uid;

    await enforceRateLimit({
      identifier: uid,
      bucket: 'restaurant:submit',
      limit: 3,
      windowSec: 3600,
    });

    let payload;
    try {
      payload = SubmitRestaurantApplicationRequestSchema.parse(request.data);
    } catch (err) {
      if (err instanceof z.ZodError) {
        console.warn('[submitRestaurantApplication] Zod validation failed', {
          uid,
          issues: err.issues,
        });
        throw new HttpsError('invalid-argument', 'Données de restaurant invalides.');
      }
      throw err;
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
      const result = await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef);

        if (!userSnap.exists) {
          throw new HttpsError('failed-precondition', 'Document utilisateur introuvable.');
        }

        const userData = userSnap.data()!;

        if (userData.emailVerified !== true) {
          throw new HttpsError('failed-precondition', 'Email non vérifié — passez par l\'étape 2 du wizard.');
        }

        if (userData.roles?.restaurant != null) {
          if (payload.restaurantId) {
            const restoSnap = await transaction.get(db.collection('restaurants').doc(payload.restaurantId));
            if (!restoSnap.exists || restoSnap.data()?.ownerId !== uid) {
              throw new HttpsError('failed-precondition', 'Restaurant introuvable ou non propriétaire.');
            }
            if (restoSnap.data()?.status !== 'rejected') {
              throw new HttpsError('already-exists', 'Vous avez déjà un restaurant actif.');
            }
          } else {
            throw new HttpsError('already-exists', 'Vous avez déjà un restaurant associé à ce compte.');
          }
        }

        const restaurantData = payload.data;
        const restaurantRef = payload.restaurantId
          ? db.collection('restaurants').doc(payload.restaurantId)
          : db.collection('restaurants').doc();

        const restaurantDoc: Record<string, unknown> = {
          ...restaurantData,
          ownerId: uid,
          status: 'pending_approval',
          rating: 2.5,
          totalReviews: 0,
          stripeConnectStatus: 'not_started',
          updatedAt: now,
        };

        if (!payload.restaurantId) {
          restaurantDoc.id = restaurantRef.id;
          restaurantDoc.createdAt = now;
        }

        if (payload.restaurantId) {
          transaction.set(restaurantRef, restaurantDoc, { merge: true });
        } else {
          transaction.create(restaurantRef, restaurantDoc);
        }

        const restaurantId = restaurantRef.id;

        transaction.update(userRef, {
          'roles.restaurant': { restaurantId, joinedAt: now },
          activeRole: 'restaurant',
          lastActiveRole: 'restaurant',
          draftRestaurant: admin.firestore.FieldValue.delete(),
          updatedAt: now,
        });

        return { success: true, restaurantId };
      });

      console.info('[submitRestaurantApplication] Success', {
        uid,
        restaurantId: result.restaurantId,
      });

      return result;
    } catch (transactionError) {
      if (transactionError instanceof HttpsError) throw transactionError;
      console.error('[submitRestaurantApplication] Transaction error', {
        uid,
        error: transactionError instanceof Error ? transactionError.message : 'unknown',
      });
      throw new HttpsError('internal', 'Erreur lors de la soumission du restaurant.');
    }
  },
);
