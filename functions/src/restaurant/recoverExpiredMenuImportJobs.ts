import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { encryptionMasterKey } from '../config/secrets.js';
import { executeMenuImportJob } from './menuImportJobs.js';

/**
 * Scheduled Cloud Function (every 5 minutes):
 * Recovers orphaned/crashed jobs whose processing lease has expired.
 */
export const recoverExpiredMenuImportJobs = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'europe-west1',
    secrets: [encryptionMasterKey],
  },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    try {
      // Find expired processing jobs across all restaurants
      const expiredJobsSnap = await db
        .collectionGroup('menu_imports')
        .where('status', '==', 'processing')
        .where('leaseExpiresAt', '<=', now)
        .limit(20)
        .get();

      if (expiredJobsSnap.empty) {
        return;
      }

      console.info(`[recoverExpiredMenuImportJobs] Found ${expiredJobsSnap.size} expired import job(s) to recover`);

      for (const jobDoc of expiredJobsSnap.docs) {
        const data = jobDoc.data();
        const restaurantId = data.restaurantId;
        const importId = jobDoc.id;

        if (restaurantId && importId) {
          try {
            await executeMenuImportJob(restaurantId, importId);
          } catch (err) {
            console.error(`[recoverExpiredMenuImportJobs] Failed to re-execute job ${importId}:`, err);
          }
        }
      }
    } catch (error) {
      console.error('[recoverExpiredMenuImportJobs] Error querying expired jobs:', error);
    }
  }
);
