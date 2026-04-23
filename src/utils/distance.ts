/**
 * Google Maps Distance Matrix utility
 * Calculates real road distance between two points.
 * Falls back to 3.5 km if the API key is missing or the call fails.
 */
import { auth } from '@/config/firebase';

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

  // Appel via la route API serveur pour éviter les erreurs CORS et les restrictions de clé
  const params = new URLSearchParams({ origin: originStr, destination: destStr });
  const url = `/api/distance?${params.toString()}`;

  try {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (data.status !== 'OK') {
      throw new Error(`Distance Matrix status: ${data.status}`);
    }

    const element = data.rows?.[0]?.elements?.[0];

    if (!element || element.status !== 'OK') {
      throw new Error(`Element status: ${element?.status ?? 'undefined'}`);
    }

    const distanceKm      = element.distance.value / 1000;          // metres → km
    const durationMinutes = Math.ceil(element.duration.value / 60); // seconds → minutes

    return { distanceKm, durationMinutes, isEstimate: false };

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
