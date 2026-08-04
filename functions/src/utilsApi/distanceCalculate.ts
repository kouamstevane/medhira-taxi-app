/**
 * Cloud Function — distanceCalculate
 *
 * Proxy serveur vers l'API Google Maps Distance Matrix.
 * Migration de Next.js GET /api/distance vers onCall pour Capacitor mobile.
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { googleMapsApiKey } from '../config/googleMaps.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { calculateServerRoute } from '../personalDriver/routeDistance.js';

interface DistancePayload {
  origin?: string;
  destination?: string;
}

export const distanceCalculate = onCall(
  {
    region: 'europe-west1',
    secrets: [googleMapsApiKey],
  },
  async (request: CallableRequest<DistancePayload>) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    await enforceRateLimit({
      identifier: request.auth.uid,
      bucket: 'utils:distanceCalculate',
      limit: 30,
      windowSec: 60,
    });

    const { origin, destination } = request.data ?? {};

    if (!origin || !destination) {
      throw new HttpsError('invalid-argument', 'Paramètres origin et destination requis.');
    }

    if (
      !origin.trim()
      || !destination.trim()
      || origin.length > 500
      || destination.length > 500
      || /[\x00-\x1F\x7F]/.test(origin)
      || /[\x00-\x1F\x7F]/.test(destination)
    ) {
      throw new HttpsError('invalid-argument', 'origin/destination invalides.');
    }

    try {
      const route = await calculateServerRoute({ origin, destination });
      return {
        distanceKm: route.distanceKm,
        durationMinutes: route.durationMinutes,
        isEstimate: false,
      };
    } catch (err) {
      console.error('[distanceCalculate] Erreur Distance Matrix:', err);
      throw new HttpsError('unavailable', 'Erreur lors de la requête Distance Matrix.');
    }
  }
);
