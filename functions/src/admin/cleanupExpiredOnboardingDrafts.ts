import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

/**
 * Cloud Function planifiée (toutes les 15 minutes) pour purger
 * les brouillons d'onboarding chauffeur et restaurateur expirés (> 30 minutes).
 */
export const cleanupExpiredOnboardingDrafts = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'europe-west1',
    memory: '256MiB',
  },
  async () => {
    console.log('[cleanupExpiredOnboardingDrafts] Démarrage de la purge des brouillons expirés...');
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const now = Date.now();
    const CUTOFF_MS = 30 * 60 * 1000; // 30 minutes

    let cleanedCount = 0;

    const toMillis = (value: unknown): number => {
      if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
        return (value as { toMillis: () => number }).toMillis();
      }
      if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
        return (value as { toDate: () => Date }).toDate().getTime();
      }
      return typeof value === 'number' ? value : 0;
    };

    const restoreRole = (data: FirebaseFirestore.DocumentData): 'client' | 'driver' | 'restaurant' => {
      const roles = data.roles ?? {};
      const lastActiveRole = data.lastActiveRole;
      if (
        (lastActiveRole === 'client' && roles.client?.enabled === true)
        || (lastActiveRole === 'driver' && roles.driver != null)
        || (lastActiveRole === 'restaurant' && roles.restaurant != null)
      ) {
        return lastActiveRole;
      }
      if (roles.client?.enabled === true) return 'client';
      if (roles.driver != null) return 'driver';
      if (roles.restaurant != null) return 'restaurant';
      return 'client';
    };

    const cleanupBatch = async (
      accountState: 'driver_onboarding' | 'restaurant_onboarding',
      onExpired: (userDoc: FirebaseFirestore.QueryDocumentSnapshot) => Promise<void>,
    ) => {
      let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

      while (true) {
        let query = db
          .collection('users')
          .where('accountState', '==', accountState)
          .orderBy(admin.firestore.FieldPath.documentId())
          .limit(50);

        if (lastDoc) query = query.startAfter(lastDoc);

        const snapshot = await query.get();
        if (snapshot.empty) break;

        for (const userDoc of snapshot.docs) {
          await onExpired(userDoc);
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        if (snapshot.size < 50) break;
      }
    };

    try {
      await cleanupBatch('driver_onboarding', async (userDoc) => {
        const data = userDoc.data();
        const updatedAt = Math.max(
          toMillis(data.updatedAt),
          toMillis(data.onboarding?.driver?.updatedAt),
        );

        if (now - updatedAt <= CUTOFF_MS) return;

        console.log(`[cleanupExpiredOnboardingDrafts] Purge du brouillon chauffeur expiré pour user ${userDoc.id}`);
        try {
          await bucket.deleteFiles({ prefix: `drivers/${userDoc.id}/drafts/` });
        } catch (storageErr) {
          console.warn(`[cleanupExpiredOnboardingDrafts] Erreur suppression storage drivers/${userDoc.id}/drafts/`, storageErr);
        }

        await userDoc.ref.update({
          accountState: 'active',
          activeRole: restoreRole(data),
          'onboarding.driver': admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        cleanedCount++;
      });

      await cleanupBatch('restaurant_onboarding', async (userDoc) => {
        const data = userDoc.data();
        const updatedAt = Math.max(
          toMillis(data.updatedAt),
          toMillis(data.onboarding?.restaurant?.updatedAt),
          toMillis(data.draftRestaurant?.updatedAt),
        );

        if (now - updatedAt <= CUTOFF_MS) return;

        console.log(`[cleanupExpiredOnboardingDrafts] Purge du brouillon restaurant expiré pour user ${userDoc.id}`);
        await userDoc.ref.update({
          accountState: 'active',
          activeRole: restoreRole(data),
          draftRestaurant: admin.firestore.FieldValue.delete(),
          'onboarding.restaurant': admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        cleanedCount++;
      });

      console.log(`[cleanupExpiredOnboardingDrafts] Terminé: ${cleanedCount} brouillon(s) nettoyé(s).`);
    } catch (err) {
      console.error('[cleanupExpiredOnboardingDrafts] Erreur globale lors du nettoyage:', err);
      throw err;
    }
  },
);
