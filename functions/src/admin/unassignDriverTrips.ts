import * as admin from 'firebase-admin';

/**
 * Libère tous les trajets personal_driver_trips futurs ou attribués ('scheduled', 'driver_assigned')
 * associés à un chauffeur dont le statut change (suspension, désactivation, refus, suppression).
 *
 * Repasse assignedDriverId et assignedVehicleId à null et le statut à 'scheduled'.
 */
export async function unassignDriverFuturePersonalTrips(
  db: admin.firestore.Firestore,
  driverId: string,
  adminUid?: string,
  reason?: string,
): Promise<number> {
  const tripsSnap = await db
    .collection('personal_driver_trips')
    .where('assignedDriverId', '==', driverId)
    .where('status', 'in', ['scheduled', 'driver_assigned'])
    .get();

  if (tripsSnap.empty) return 0;

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  tripsSnap.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, {
      assignedDriverId: null,
      assignedVehicleId: null,
      status: 'scheduled',
      unassignedReason: reason || 'driver_status_changed',
      unassignedAt: now,
      unassignedBy: adminUid || 'system',
      updatedAt: now,
    });
  });

  const driverRef = db.collection('drivers').doc(driverId);
  batch.update(driverRef, {
    activePersonalDriverTripId: null,
    isAvailable: false,
    updatedAt: now,
  });

  await batch.commit();

  try {
    await db.collection('notifications').add({
      userId: adminUid || 'system',
      title: 'Trajets Chauffeur Personnel libérés',
      body: `${tripsSnap.docs.length} trajet(s) du chauffeur ${driverId} ont été remis en statut scheduled suite à une révision de statut/suspension.`,
      type: 'admin_alert',
      metadata: {
        driverId,
        unassignedCount: tripsSnap.docs.length,
        reason: reason || 'driver_status_changed',
      },
      read: false,
      createdAt: now,
    });
  } catch (err) {
    console.warn('[unassignDriverFuturePersonalTrips] Admin notification failed:', err);
  }

  return tripsSnap.docs.length;
}
