import { onDocumentCreated, FirestoreEvent, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function parseTripScheduledDate(tripData: FirebaseFirestore.DocumentData | undefined): Date | null {
  if (!tripData) return null;
  const val = tripData.scheduledAtUtc ?? tripData.scheduledAtIso ?? tripData.scheduledAt;
  if (val instanceof Date) return Number.isFinite(val.getTime()) ? val : null;
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => unknown }).toDate === 'function') {
    const d = (val as { toDate: () => unknown }).toDate();
    return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof val === 'string' && val.trim()) {
    const d = new Date(val);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

const SCHEDULE_COLLISION_WINDOW_MS = 60 * 60 * 1000;

function hasScheduleCollision(
  targetScheduledDate: Date | null,
  assignedTripsDocs: FirebaseFirestore.QueryDocumentSnapshot[],
): boolean {
  if (!targetScheduledDate) return false;
  const targetTime = targetScheduledDate.getTime();
  for (const doc of assignedTripsDocs) {
    const existingDate = parseTripScheduledDate(doc.data());
    if (!existingDate) continue;
    if (Math.abs(targetTime - existingDate.getTime()) < SCHEDULE_COLLISION_WINDOW_MS) {
      return true;
    }
  }
  return false;
}

export const onSpecialTripCreated = onDocumentCreated(
  {
    document: 'personal_driver_trips/{tripId}',
    region: 'europe-west1',
  },
  async (event: FirestoreEvent<QueryDocumentSnapshot | undefined, { tripId: string }>) => {
    const snapshot = event.data;
    if (!snapshot || !snapshot.exists) return;

    const tripData = snapshot.data();
    if (!tripData) return;

    const isSpecial = tripData.isSpecialTrip === true || tripData.direction === 'special';
    if (!isSpecial) return;

    const db = getDb();
    const tripId = event.params.tripId;
    const scheduledDateStr = tripData.scheduledAtIso ?? tripData.scheduledAtUtc ?? 'date non spécifiée';

    const adminsSnap = await db.collection('admins').get();
    const batch = db.batch();

    const adminNotificationIds: string[] = [];
    if (!adminsSnap.empty) {
      for (const adminDoc of adminsSnap.docs) {
        const notifRef = db.collection('notifications').doc();
        adminNotificationIds.push(notifRef.id);
        const adminUid = adminDoc.id;
        batch.set(notifRef, {
          notificationId: notifRef.id,
          userId: adminUid,
          title: '🚖 Nouveau Trajet Spécial à affecter',
          body: `Un trajet spécial (${tripId}) a été réservé pour le ${scheduledDateStr}.`,
          type: 'info',
          metadata: {
            tripId,
            subscriptionId: tripData.subscriptionId ?? '',
            clientId: tripData.userId ?? '',
          },
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    if (tripData.status !== 'scheduled' || tripData.assignedDriverId != null) {
      if (adminNotificationIds.length > 0) {
        await batch.commit();
      }
      return;
    }

    const scheduledDate = parseTripScheduledDate(tripData);

    const driversSnap = await db.collection('drivers').get();
    let selectedDriverId: string | null = null;
    let selectedVehicleId: string | null = null;

    for (const driverDoc of driversSnap.docs) {
      const dData = driverDoc.data();
      const isApproved =
        dData.status === 'approved' ||
        dData.driverStatus === 'approved' ||
        dData.kycStatus === 'approved';
      if (!isApproved) continue;

      if (dData.isAvailable === false || dData.availabilityStatus === 'busy_personal_driver') continue;

      const existingTripsSnap = await db
        .collection('personal_driver_trips')
        .where('assignedDriverId', '==', driverDoc.id)
        .where('status', 'in', [
          'scheduled',
          'driver_assigned',
          'driver_en_route',
          'driver_arrived',
          'passenger_picked_up',
          'in_progress',
        ])
        .get();

      if (hasScheduleCollision(scheduledDate, existingTripsSnap.docs)) continue;

      let vehicleId: string | null = dData.vehicleId ?? dData.activeVehicleId ?? null;

      if (!vehicleId) {
        const vehiclesSnap = await db
          .collection('vehicles')
          .where('ownerId', '==', driverDoc.id)
          .limit(1)
          .get();
        if (!vehiclesSnap.empty) {
          vehicleId = vehiclesSnap.docs[0].id;
        }
      }

      if (!vehicleId) {
        const altVehiclesSnap = await db
          .collection('vehicles')
          .where('driverId', '==', driverDoc.id)
          .limit(1)
          .get();
        if (!altVehiclesSnap.empty) {
          vehicleId = altVehiclesSnap.docs[0].id;
        }
      }

      if (vehicleId) {
        selectedDriverId = driverDoc.id;
        selectedVehicleId = vehicleId;
        break;
      }
    }

    const tripRef = db.collection('personal_driver_trips').doc(tripId);

    if (selectedDriverId && selectedVehicleId) {
      batch.update(tripRef, {
        assignedDriverId: selectedDriverId,
        assignedVehicleId: selectedVehicleId,
        status: 'driver_assigned',
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
        assignedBy: 'system_auto_assignment',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const driverNotifRef = db.collection('notifications').doc();
      batch.set(driverNotifRef, {
        notificationId: driverNotifRef.id,
        userId: selectedDriverId,
        title: '🚖 Nouveau trajet spécial attribué',
        body: `Vous avez été automatiquement attribué au trajet spécial prévu le ${scheduledDateStr}.`,
        type: 'personal_driver_trip_assigned_driver',
        metadata: { tripId },
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (tripData.userId) {
        const clientNotifRef = db.collection('notifications').doc();
        batch.set(clientNotifRef, {
          notificationId: clientNotifRef.id,
          userId: tripData.userId,
          title: '✅ Chauffeur attribué à votre trajet spécial',
          body: `Un chauffeur vous a été attribué pour votre trajet du ${scheduledDateStr}.`,
          type: 'personal_driver_trip_assigned',
          metadata: { tripId },
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } else if (!adminsSnap.empty) {
      for (const adminDoc of adminsSnap.docs) {
        const alertNotifRef = db.collection('notifications').doc();
        batch.set(alertNotifRef, {
          notificationId: alertNotifRef.id,
          userId: adminDoc.id,
          title: '⚠️ Attribution manuelle requise',
          body: `Aucun chauffeur disponible pour le trajet spécial ${tripId}. Veuillez l'attribuer manuellement.`,
          type: 'alert',
          metadata: { tripId },
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();
  },
);
