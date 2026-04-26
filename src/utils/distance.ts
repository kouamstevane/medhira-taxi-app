/**
 * Google Maps Distance Matrix utility
 * Calculates real road distance between two points.
 * Falls back to 3.5 km if the API key is missing or the call fails.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

const FALLBACK_DISTANCE_KM = 3.5;

export interface DistanceResult {
  distanceKm: number;
  durationMinutes: number;
  isEstimate: boolean;
}

/**
 * Calculate delivery distance using Google Maps Distance Matrix API.
 * Accepts either a text address or a lat/lng pair for each endpoint.
 */
export async function getDeliveryDistance(
  origin: string | { lat: number; lng: number },
  destination: string | { lat: number; lng: number }
): Promise<DistanceResult> {
  const originStr  = typeof origin      === 'string' ? origin      : `${origin.lat},${origin.lng}`;
  const destStr    = typeof destination === 'string' ? destination : `${destination.lat},${destination.lng}`;

  // Appel via Cloud Function pour éviter les erreurs CORS et les restrictions de clé
  try {
    const distanceFn = httpsCallable<
      { origin: string; destination: string },
      { distanceKm: number; durationMinutes: number; isEstimate: boolean }
    >(functions, 'distanceCalculate');

    const result = await distanceFn({ origin: originStr, destination: destStr });
    const { distanceKm, durationMinutes, isEstimate } = result.data;

    return { distanceKm, durationMinutes, isEstimate: isEstimate ?? false };

  } catch (err) {
    console.warn('[distance] Distance Matrix call failed, using fallback:', err);
    return { distanceKm: FALLBACK_DISTANCE_KM, durationMinutes: 15, isEstimate: true };
  }
}

/**
 * Haversine distance in km between two lat/lng points (great-circle).
 */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const toRad = (deg: number) => deg * (Math.PI / 180);
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function getTimestamp(val: unknown): number {
  if (val && typeof val === 'object' && 'toMillis' in val && typeof (val as { toMillis: unknown }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof val === 'number') return val;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  return 0;
}
