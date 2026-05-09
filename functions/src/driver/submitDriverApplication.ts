import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { SubmitDriverApplicationRequestSchema } from '../validators/schemas.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';

function hasRequiredFields(data: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((f) => data[f] != null && data[f] !== '');
}

export const submitDriverApplication = onCall(
  { region: 'europe-west1', cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    if (!request.auth.uid) {
      throw new HttpsError('unauthenticated', 'UID manquant.');
    }

    await enforceRateLimit({
      identifier: request.auth.uid,
      bucket: 'driver:submit',
      limit: 3,
      windowSec: 3600,
    });

    let payload;
    try {
      payload = SubmitDriverApplicationRequestSchema.parse(request.data);
    } catch (err) {
      if (err instanceof z.ZodError) {
        console.warn('[submitDriverApplication] Zod validation failed', {
          uid: request.auth.uid,
          issues: err.issues,
        });
        throw new HttpsError('invalid-argument', 'Données de profil chauffeur invalides.');
      }
      throw err;
    }

    if (request.auth.uid !== payload.driverId) {
      throw new HttpsError('permission-denied', 'UID mismatch.');
    }

    const authEmail = request.auth.token.email as string | undefined;
    const driverData = payload.driverData;

    if (authEmail && driverData.email !== authEmail) {
      throw new HttpsError('permission-denied', 'Email mismatch.');
    }

    if (driverData.phoneNumber != null) {
      throw new HttpsError('failed-precondition', 'phoneNumber doit être null.');
    }

    if (
      (driverData.driverType === 'chauffeur' || driverData.driverType === 'les_deux') &&
      driverData.car?.year != null &&
      Number(driverData.car.year) < 2010
    ) {
      throw new HttpsError('failed-precondition', 'Véhicule trop ancien. Année minimale: 2010.');
    }

    const requiredFields = ['firstName', 'lastName', 'phone'];
    if (driverData.driverType === 'chauffeur' || driverData.driverType === 'les_deux') {
      requiredFields.push('car');
    }
    if (driverData.driverType === 'livreur' && driverData.vehicleType !== 'velo' && !driverData.deliveryVehicle) {
      throw new HttpsError('failed-precondition', 'Véhicule livreur manquant.');
    }
    if (!hasRequiredFields(driverData as unknown as Record<string, unknown>, requiredFields)) {
      throw new HttpsError('failed-precondition', 'Champs requis manquants.');
    }

    const db = admin.firestore();
    const driverRef = db.collection('drivers').doc(payload.driverId);
    const userRef = db.collection('users').doc(payload.driverId);
    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
      const result = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(driverRef);
        const existingStatus = snapshot.exists ? (snapshot.data()?.status as string | undefined) : undefined;

        if (existingStatus && !['draft', 'action_required', 'rejected', 'pending'].includes(existingStatus)) {
          throw new HttpsError('failed-precondition', 'Compte déjà actif.');
        }

        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) {
          throw new HttpsError('failed-precondition', 'Document utilisateur introuvable.');
        }

        const sanitizedData = {
          ...driverData,
          uid: payload.driverId,
          email: driverData.email,
          phoneNumber: null,
          status: 'pending',
          updatedAt: now,
          driverType: driverData.driverType,
          cityId: driverData.cityId || 'edmonton',
          vehicleType: driverData.vehicleType ?? (driverData.driverType === 'chauffeur' ? 'voiture' : null),
          activeMode: driverData.driverType === 'les_deux' ? 'taxi' : null,
          activeDeliveryOrderId: null,
          deliveriesCompleted: 0,
          deliveryEarnings: 0,
          ratingsCount: 0,
        };

        if (snapshot.exists) {
          const existingData = snapshot.data();
          if (existingData) {
            const rejectionFieldsToPreserve = [
              'rejectionReason', 'rejectionDate', 'rejectionDetails',
              'rejectionCount', 'lastRejectionBy',
            ];
            const preservedFields = rejectionFieldsToPreserve.reduce((acc, field) => {
              if (field in existingData && existingData[field] != null) {
                acc[field] = existingData[field];
              }
              return acc;
            }, {} as Record<string, unknown>);
            transaction.set(driverRef, { ...sanitizedData, ...preservedFields }, { merge: true });
          } else {
            transaction.set(driverRef, sanitizedData, { merge: true });
          }
        } else {
          transaction.set(driverRef, { ...sanitizedData, createdAt: now });
        }

        transaction.update(userRef, {
          'roles.driver': { joinedAt: now },
          activeRole: 'driver',
          lastActiveRole: 'driver',
          updatedAt: now,
        });

        return { success: true, existed: snapshot.exists };
      });

      return result;
    } catch (transactionError) {
      if (transactionError instanceof HttpsError) throw transactionError;
      throw new HttpsError('internal', 'Erreur lors de la soumission du profil chauffeur.');
    }
  },
);

export { submitDriverApplication as createDriverProfile };
