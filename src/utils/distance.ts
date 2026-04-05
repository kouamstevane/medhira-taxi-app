/**
 * Google Maps Distance Matrix utility
 * Calculates real road distance between two points.
 * Falls back to 3.5 km if the API key is missing or the call fails.
 */

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
  const originStr  = typeof origin      === 'string' ? encodeURIComponent(origin)      : `${origin.lat},${origin.lng}`;
  const destStr    = typeof destination === 'string' ? encodeURIComponent(destination)  : `${destination.lat},${destination.lng}`;

  // Appel via la route API serveur pour éviter les erreurs CORS et les restrictions de clé
  const url = `/api/distance?origin=${originStr}&destination=${destStr}`;

  try {
    const res = await fetch(url);
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
