import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { sendAdminRestaurantNotification } from '../email-service.js';

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const ADMIN_NOTIFICATION_EMAIL = defineSecret('ADMIN_NOTIFICATION_EMAIL');

export const notifyAdminNewRestaurant = onDocumentCreated(
  {
    document: 'restaurants/{restaurantId}',
    region: 'europe-west1',
    secrets: [RESEND_API_KEY, ADMIN_NOTIFICATION_EMAIL],
  },
  async (event) => {
    const data = event.data?.data();
    const restaurantId = event.params.restaurantId;
    if (!data) {
      logger.warn('[notifyAdminNewRestaurant] no data', { restaurantId });
      return;
    }
    if (data.status !== 'pending_approval') {
      logger.info('[notifyAdminNewRestaurant] skipped: not pending_approval', { restaurantId, status: data.status });
      return;
    }
    try {
      await sendAdminRestaurantNotification({
        restaurantName: data.name ?? '(sans nom)',
        restaurantId,
        ownerEmail: data.ownerEmail ?? '',
      });
      logger.info('[notifyAdminNewRestaurant] email sent', { restaurantId });
    } catch (err) {
      logger.error('[notifyAdminNewRestaurant] email send failed', { restaurantId, error: (err as Error).message });
    }
  }
);
