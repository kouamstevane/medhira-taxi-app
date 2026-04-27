/**
 * Cloud Function — distanceCalculate
 *
 * Proxy serveur vers l'API Google Maps Distance Matrix.
 * Migration de Next.js GET /api/distance vers onCall pour Capacitor mobile.
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');

const MAX_PARAM_LEN = 200;
const LATLNG_RE = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;
const FORBIDDEN_CHARS = /[\x00-\x1F\x7F&?#=]/;

function isValidLocationParam(v: string): boolean {
  if (!v || v.length > MAX_PARAM_LEN) return false;
  if (FORBIDDEN_CHARS.test(v)) return false;
  if (LATLNG_RE.test(v)) {
    const [latStr, lngStr] = v.split(',');
    const lat = Number(latStr);
    const lng = Number(lngStr);
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
  return true;
}

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

    if (!isValidLocationParam(origin) || !isValidLocationParam(destination)) {
      throw new HttpsError('invalid-argument', 'origin/destination invalides.');
    }

    const apiKey = googleMapsApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Clé API non configurée.');
    }

    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', origin);
    url.searchParams.set('destinations', destination);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('language', 'fr');
    url.searchParams.set('key', apiKey);

    try {
      const res = await fetch(url.toString());
      const data = await res.json();

      const elem = data?.rows?.[0]?.elements?.[0];
      if (data.status !== 'OK' || !elem || elem.status !== 'OK') {
        throw new HttpsError('not-found', `Distance Matrix: ${elem?.status ?? data.status}`);
      }

      return {
        distanceKm: elem.distance.value / 1000,
        durationMinutes: Math.ceil(elem.duration.value / 60),
        isEstimate: false,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('[distanceCalculate] Erreur Distance Matrix:', err);
      throw new HttpsError('unavailable', 'Erreur lors de la requête Distance Matrix.');
    }
  }
);
