import * as admin from 'firebase-admin';

/**
 * Types de notifications supportés
 */
export type NotificationType =
  | 'booking_request'
  | 'trip_started'
  | 'trip_completed'
  | 'driver_arrived'
  | 'payment_received'
  | 'food_order'
  | 'food_order_update'
  | 'alert'
  | 'info';

/**
 * Paramètres pour créer une notification
 */
export interface CreateNotificationParams {
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Crée une seule notification dans la collection Firestore 'notifications'.
 * 
 * @example
 * await createNotification({
 *   userId: 'abc123',
 *   title: 'Course confirmée',
 *   body: 'Votre chauffeur arrive dans 5 min.',
 *   type: 'booking_request',
 *   metadata: { tripId: 'trip_456' },
 * });
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const ref = admin.firestore().collection('notifications').doc();
  await ref.set({
    notificationId: ref.id,
    userId: params.userId,
    title: params.title,
    body: params.body,
    type: params.type,
    metadata: params.metadata ?? {},
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Crée des notifications en masse pour plusieurs utilisateurs (batch).
 * Utilise Promise.allSettled pour éviter qu'un échec bloque les autres.
 * 
 * @example
 * await createBulkNotifications(driverIds, {
 *   title: '🍔 Nouvelle commande',
 *   body: 'Livraison 12.00 CAD',
 *   type: 'food_order',
 *   metadata: { orderId: 'order_789' },
 * });
 */
export async function createBulkNotifications(
  userIds: string[],
  params: Omit<CreateNotificationParams, 'userId'>
): Promise<void> {
  if (userIds.length === 0) return;

  const writes = userIds.map((userId) => createNotification({ ...params, userId }));
  const results = await Promise.allSettled(writes);

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.warn(`[notificationService] ${failed}/${userIds.length} notifications ont échoué.`);
  }
}
