import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { getRestaurantIdsFromRole } from './submitRestaurantApplication.js';

const DeleteRestaurantRequestSchema = z.object({
  restaurantId: z.string().trim().min(1).max(128),
}).strict();

export function getRestaurantIdsAfterDeletion(role: unknown, restaurantId: string): string[] {
  return getRestaurantIdsFromRole(role).filter((id) => id !== restaurantId);
}

export function getRestaurantStoragePrefixes(restaurantId: string): string[] {
  return [
    `restaurant-images/${restaurantId}/`,
    `menu-images/${restaurantId}/`,
    `menu-imports/${restaurantId}/`,
  ];
}

async function deleteRestaurantStorage(restaurantId: string): Promise<void> {
  const bucket = admin.storage().bucket();
  await Promise.all(
    getRestaurantStoragePrefixes(restaurantId).map((prefix) => bucket.deleteFiles({ prefix })),
  );
}

async function deleteRestaurantSubcollections(
  restaurantRef: admin.firestore.DocumentReference,
): Promise<void> {
  const db = admin.firestore();
  const subcollections = await restaurantRef.listCollections();
  await Promise.all(subcollections.map((subcollection) => db.recursiveDelete(subcollection)));
}

export const deleteRestaurant = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    const parsed = DeleteRestaurantRequestSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Identifiant de restaurant invalide.');
    }

    const { restaurantId } = parsed.data;
    const uid = request.auth.uid;
    await enforceRateLimit({
      identifier: uid,
      bucket: 'restaurant:delete',
      limit: 3,
      windowSec: 3600,
    });

    const db = admin.firestore();
    const restaurantRef = db.collection('restaurants').doc(restaurantId);
    const restaurantSnap = await restaurantRef.get();

    if (!restaurantSnap.exists) {
      return { success: true, restaurantId, alreadyDeleted: true };
    }

    if (restaurantSnap.data()?.ownerId !== uid) {
      throw new HttpsError('permission-denied', 'Vous n’êtes pas propriétaire de ce restaurant.');
    }

    try {
      await deleteRestaurantStorage(restaurantId);
      await deleteRestaurantSubcollections(restaurantRef);

      const userRef = db.collection('users').doc(uid);
      await db.runTransaction(async (transaction) => {
        const [currentRestaurant, userSnap] = await Promise.all([
          transaction.get(restaurantRef),
          transaction.get(userRef),
        ]);

        if (!currentRestaurant.exists || currentRestaurant.data()?.ownerId !== uid) {
          throw new HttpsError('failed-precondition', 'Le restaurant n’existe plus ou n’est plus associé à votre compte.');
        }

        const userData = userSnap.data() ?? {};
        const restaurantRole = userData.roles?.restaurant;
        const remainingRestaurantIds = getRestaurantIdsAfterDeletion(restaurantRole, restaurantId);
        const roleUpdate: Record<string, unknown> = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (remainingRestaurantIds.length > 0) {
          roleUpdate['roles.restaurant'] = {
            restaurantId: remainingRestaurantIds[0],
            joinedAt: restaurantRole?.joinedAt ?? admin.firestore.FieldValue.serverTimestamp(),
            restaurantIds: remainingRestaurantIds,
          };
        } else {
          roleUpdate['roles.restaurant'] = admin.firestore.FieldValue.delete();
          roleUpdate.activeRole = userData.roles?.driver ? 'driver' : 'client';
          roleUpdate.lastActiveRole = userData.roles?.driver ? 'driver' : 'client';
        }

        transaction.delete(restaurantRef);
        transaction.update(userRef, roleUpdate);
      });

      console.info('[deleteRestaurant] Success', { uid, restaurantId });
      return { success: true, restaurantId, alreadyDeleted: false };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error('[deleteRestaurant] Failed', {
        uid,
        restaurantId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw new HttpsError('internal', 'Impossible de supprimer complètement le restaurant. Réessayez.');
    }
  },
);
