/**
 * Cloud Function — reverseGeocode
 *
 * Proxy serveur vers l'API Google Maps Geocoding (reverse).
 * Migration de Next.js GET /api/reverse-geocode vers onCall pour Capacitor mobile.
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');

interface ReverseGeocodePayload {
  lat?: number | string;
  lng?: number | string;
}

interface ReverseGeocodeResult {
  address: string;
  place_id: string;
  results: unknown[];
}

export const reverseGeocode = onCall(
  {
    region: 'europe-west1',
    secrets: [googleMapsApiKey],
  },
  async (request: CallableRequest<ReverseGeocodePayload>): Promise<ReverseGeocodeResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    await enforceRateLimit({
      identifier: request.auth.uid,
      bucket: 'utils:reverseGeocode',
      limit: 30,
      windowSec: 60,
    });

    const latRaw = request.data?.lat;
    const lngRaw = request.data?.lng;

    if (latRaw === undefined || latRaw === null || lngRaw === undefined || lngRaw === null) {
      throw new HttpsError('invalid-argument', 'Latitude and longitude are required.');
    }

    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      throw new HttpsError('invalid-argument', 'Invalid latitude or longitude.');
    }

    const apiKey = googleMapsApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'API Key not configured.');
    }

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('latlng', `${lat},${lng}`);
      url.searchParams.set('key', apiKey);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status === 'OK' && data.results && data.results.length > 0) {
        return {
          address: data.results[0].formatted_address,
          place_id: data.results[0].place_id,
          results: data.results,
        };
      }

      console.warn('[reverseGeocode] No results', { status: data?.status });
      throw new HttpsError('not-found', 'No results found.');
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error('[reverseGeocode] Erreur Geocoding:', error);
      throw new HttpsError('internal', 'Une erreur est survenue. Veuillez réessayer.');
    }
  }
);
