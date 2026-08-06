import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

export const DELAY_THRESHOLD_MINUTES = 10;
export const NOSHOW_UNASSIGN_THRESHOLD_MINUTES = 30;
export const MAX_TRIPS_PER_CHECK_PAGE = 500;

export async function checkPersonalDriverTripsDelayUntilExhausted(
  db: FirebaseFirestore.Firestore,
  nowUtc: Date,
): Promise<{ alertsSent: number; unassignedCount: number }> {
  let alertsSent = 0;
  let unassignedCount = 0;

  const nowMs = nowUtc.getTime();
  const threshold10Ms = nowMs - DELAY_THRESHOLD_MINUTES * 60 * 1000;

  // Requêter les trajets planifiés ou avec chauffeur attribué
  const tripsSnap = await db
    .collection('personal_driver_trips')
    .where('status', 'in', ['scheduled', 'driver_assigned'])
    .limit(MAX_TRIPS_PER_CHECK_PAGE)
    .get();

  if (tripsSnap.empty) {
    return { alertsSent, unassignedCount };
  }

  for (const tripDoc of tripsSnap.docs) {
    const trip = tripDoc.data();
    if (!trip.scheduledAtIso) continue;

    const scheduledTime = new Date(trip.scheduledAtIso).getTime();
    if (isNaN(scheduledTime) || scheduledTime > threshold10Ms) {
      // Moins de 10 min de retard, pas d'action
      continue;
    }

    const delayMinutes = Math.floor((nowMs - scheduledTime) / (60 * 1000));
    const assignedDriverId = trip.assignedDriverId as string | null | undefined;
    const userId = trip.userId as string | undefined;

    // CAS 2: Retard >= 30 min avec chauffeur attribué -> No-Show & désattribution
    if (delayMinutes >= NOSHOW_UNASSIGN_THRESHOLD_MINUTES && assignedDriverId) {
      const batch = db.batch();

      batch.update(tripDoc.ref, {
        assignedDriverId: null,
        assignedVehicleId: null,
        status: 'scheduled',
        driverDelayAlert: true,
        noShowUnassignedAt: admin.firestore.FieldValue.serverTimestamp(),
        previousAssignedDriverId: assignedDriverId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const driverRef = db.collection('drivers').doc(assignedDriverId);
      batch.update(driverRef, {
        activePersonalDriverTripId: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Notification au client
      if (userId) {
        const clientNotifRef = db.collection('notifications').doc();
        batch.set(clientNotifRef, {
          notificationId: clientNotifRef.id,
          userId,
          title: 'Recherche de chauffeur en cours',
          body: 'En raison d’un retard prolongé du chauffeur initial, nous réattribuons votre course en priorité.',
          type: 'trip_reassigning',
          metadata: {
            tripId: tripDoc.id,
            delayMinutes,
          },
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Notification urgente Admin
      const adminNotifRef = db.collection('notifications').doc();
      batch.set(adminNotifRef, {
        notificationId: adminNotifRef.id,
        userId: 'system',
        title: 'Alerte No-Show Chauffeur (H+30 min)',
        body: `Le chauffeur ${assignedDriverId} n’a pas pris en charge le trajet (${tripDoc.id}) après ${delayMinutes} min. Le trajet a été remis en statut 'scheduled' pour réattribution urgente.`,
        type: 'admin_noshow_alert',
        metadata: {
          tripId: tripDoc.id,
          previousDriverId: assignedDriverId,
          delayMinutes,
        },
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();
      unassignedCount += 1;
    }
    // CAS 1: Retard >= 10 min et < 30 min -> Alerte retard (si pas encore envoyée)
    else if (!trip.driverDelayAlert) {
      const batch = db.batch();

      batch.update(tripDoc.ref, {
        driverDelayAlert: true,
        delayAlertSentAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Notification au client
      if (userId) {
        const clientNotifRef = db.collection('notifications').doc();
        batch.set(clientNotifRef, {
          notificationId: clientNotifRef.id,
          userId,
          title: 'Retard du chauffeur',
          body: 'Votre chauffeur tarde à démarrer la course. L’équipe supervise votre trajet.',
          type: 'driver_delay',
          metadata: {
            tripId: tripDoc.id,
            delayMinutes,
          },
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Notification Admin
      const adminNotifRef = db.collection('notifications').doc();
      batch.set(adminNotifRef, {
        notificationId: adminNotifRef.id,
        userId: 'system',
        title: 'Alerte Retard Chauffeur (H+10 min)',
        body: `Le chauffeur ${assignedDriverId || 'non attribué'} est en retard de ${delayMinutes} min sur le trajet ${tripDoc.id}.`,
        type: 'admin_delay_alert',
        metadata: {
          tripId: tripDoc.id,
          driverId: assignedDriverId ?? null,
          delayMinutes,
        },
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();
      alertsSent += 1;
    }
  }

  return { alertsSent, unassignedCount };
}

export const checkPersonalDriverTripsDelay = onSchedule(
  { schedule: 'every 5 minutes', region: 'europe-west1' },
  async () => {
    if (!admin.apps.length) admin.initializeApp();
    await checkPersonalDriverTripsDelayUntilExhausted(admin.firestore(), new Date());
  },
);
