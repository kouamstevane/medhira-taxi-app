import { onSchedule, ScheduledEvent } from 'firebase-functions/v2/scheduler';
import { onDocumentUpdated, FirestoreEvent, Change, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
// NOTE: firebase-functions/v2/identity n'expose PAS de déclencheur de suppression.
// "beforeUserDeleted" n'existe pas en v2 — seuls beforeUserCreated et beforeUserSignIn
// sont disponibles (fonctions bloquantes). Pour la suppression, on utilise le SDK v1
// qui est la seule API Firebase qui supporte ce déclencheur.
import * as functionsV1 from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

admin.initializeApp();

// ============================================================================
// Fonction planifiée : anonymisation quotidienne (§8.2)
// ============================================================================
export const anonymizeDriverData = onSchedule(
  {
    schedule: '0 2 * * *', // 2h du matin
    timeZone: 'Africa/Douala',
    region: 'europe-west1', // Adaptez selon votre région
    memory: '256MiB',
  },
  async (_event: ScheduledEvent) => {
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = Date.now() - thirtyDaysInMs;
    
    const db = admin.database();
    const oldLocationsRef = db.ref('driver_locations');
    
    const snapshot = await oldLocationsRef
      .orderByChild('timestamp')
      .endAt(thirtyDaysAgo)
      .limitToFirst(1000)
      .once('value');
    
    if (!snapshot.exists()) {
      console.log('No old driver locations to anonymize');
      return;
    }
    
    const updates: Record<string, null> = {};
    let count = 0;
    
    snapshot.forEach((child) => {
      const location = child.val();
      if (location?.timestamp && location.timestamp < thirtyDaysAgo) {
        updates[child.key!] = null;
        count++;
      }
    });
    
    if (Object.keys(updates).length > 0) {
      await oldLocationsRef.update(updates);
      console.log(`Anonymized ${count} driver locations`);
      
      await admin.firestore().collection('audit_logs').add({
        action: 'ANONYMIZE_DRIVER_LOCATIONS',
        count,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        olderThan: thirtyDaysAgo,
      });
    }
  }
);

// ============================================================================
// Déclencheur : suppression compte utilisateur
// Utilise le SDK v1 — firebase-functions/v2/identity ne propose pas
// de déclencheur de suppression (uniquement des fonctions bloquantes).
// ============================================================================
export const deleteDriverOnAccountDelete = functionsV1
  .region('europe-west1')
  .auth.user()
  .onDelete(async (user: admin.auth.UserRecord) => {
    const driverId = user.uid;
    const db = admin.database();
    
    try {
      await db.ref(`driver_locations/${driverId}`).remove();
      await db.ref(`driver_status/${driverId}`).remove();
      
      console.log(`Deleted all data for driver ${driverId}`);
      
      await admin.firestore().collection('audit_logs').add({
        action: 'DELETE_DRIVER_DATA',
        driverId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        reason: 'ACCOUNT_DELETION',
      });
    } catch (error) {
      console.error(`Error deleting data for driver ${driverId}:`, error);
      throw error;
    }
  });

// ============================================================================
// Déclencheur : course terminée → planification anonymisation
// ============================================================================
export const scheduleTripDataAnonymization = onDocumentUpdated(
  {
    document: 'bookings/{bookingId}',
    region: 'europe-west1',
  },
  async (event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, { bookingId: string }>) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    
    if (!beforeData || !afterData) return;
    
    const beforeStatus = (beforeData as any).status;
    const afterStatus = (afterData as any).status;

    // Vérification transition vers "completed"
    if (beforeStatus !== 'completed' && afterStatus === 'completed') {
      const bookingId = event.params.bookingId;
      const driverId = afterData.driverId;
      const completedAt = afterData.completedAt;
      
      if (!completedAt) {
        console.warn(`Booking ${bookingId} completed without timestamp`);
        return;
      }
      
      const completedTimestamp = completedAt.toDate().getTime();
      const anonymizeAt = completedTimestamp + (30 * 24 * 60 * 60 * 1000);
      
      await admin.firestore().collection('anonymization_tasks').add({
        type: 'TRIP_LOCATIONS',
        bookingId,
        driverId,
        anonymizeAt,
        status: 'scheduled',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      console.log(`Scheduled anonymization for booking ${bookingId}`);
    }
  }
);

// ============================================================================
// Fonction planifiée : traitement des tâches d'anonymisation
// ============================================================================
export const processAnonymizationTasks = onSchedule(
  {
    schedule: '0 * * * *', // Toutes les heures
    timeZone: 'Africa/Douala',
    region: 'europe-west1',
    memory: '256MiB',
  },
  async (_event: ScheduledEvent) => {
    const db = admin.firestore();
    const now = Date.now();
    
    const snapshot = await db
      .collection('anonymization_tasks')
      .where('status', '==', 'scheduled')
      .where('anonymizeAt', '<=', now)
      .limit(100)
      .get();
    
    if (snapshot.empty) {
      console.log('No tasks to process');
      return;
    }
    
    const batch = db.batch();
    let processedCount = 0;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const task = {
        type: data.type as string,
        driverId: data.driverId as string,
        bookingId: data.bookingId as string,
        status: data.status as string,
      };
      
      try {
        if (task.type === 'TRIP_LOCATIONS') {
          // ✅ Protection: Ne pas supprimer si le chauffeur est actuellement en ligne (medJira.md #115)
          const driverId = task.driverId; // Ensure driverId is defined from task
          const driverRef = admin.firestore().collection('drivers').doc(driverId);
          const driverSnap = await driverRef.get();
          const driverData = driverSnap.data();
          
          if (driverData && (driverData.status === 'available' || driverData.status === 'busy')) {
            console.log(`Anonymisation sautée pour le chauffeur actif: ${driverId}`);
            continue;
          }

          await admin.database().ref(`locations/${driverId}`).remove();
          
          batch.update(doc.ref, {
            status: 'completed',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          
          processedCount++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing task ${doc.id}:`, error);
        
        batch.update(doc.ref, {
          status: 'failed',
          error: errorMessage,
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
    
    await batch.commit();
    console.log(`Processed ${processedCount} tasks`);
  }
);