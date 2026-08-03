import { defineSecret } from 'firebase-functions/params';

const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');
const MAX_LOCATION_LENGTH = 500;
const FORBIDDEN_LOCATION_CHARS = /[\x00-\x1F\x7F]/;

function assertValidLocation(value: string): void {
  if (!value.trim() || value.length > MAX_LOCATION_LENGTH || FORBIDDEN_LOCATION_CHARS.test(value)) {
    throw new Error('Invalid route location');
  }
}

function assertPositiveFinite(value: number, message: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(message);
}

async function fetchDistanceMatrix(url: URL): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Google Distance Matrix request failed');
  const data = await response.json() as Record<string, unknown>;
  if (!data || typeof data !== 'object') throw new Error('Invalid Google Distance Matrix response');
  return data;
}

export async function calculateServerRoute(input: {
  origin: string;
  destination: string;
}): Promise<{ distanceKm: number; durationMinutes: number }> {
  assertValidLocation(input.origin);
  assertValidLocation(input.destination);
  const apiKey = googleMapsApiKey.value().trim();
  if (!apiKey) throw new Error('Google Maps API key is not configured');

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', input.origin);
  url.searchParams.set('destinations', input.destination);
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('language', 'fr');
  url.searchParams.set('key', apiKey);

  const data = await fetchDistanceMatrix(url);
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const firstRow = rows[0] as Record<string, unknown> | undefined;
  const elements = Array.isArray(firstRow?.elements) ? firstRow.elements : [];
  const element = elements[0] as Record<string, unknown> | undefined;
  const distance = element?.distance as Record<string, unknown> | undefined;
  const duration = element?.duration as Record<string, unknown> | undefined;
  const distanceMeters = Number(distance?.value);
  const durationSeconds = Number(duration?.value);
  if (data.status !== 'OK' || element?.status !== 'OK') {
    throw new Error(`Distance Matrix route unavailable: ${String(element?.status ?? data.status)}`);
  }
  assertPositiveFinite(distanceMeters, 'Distance Matrix returned an invalid distance');
  assertPositiveFinite(durationSeconds, 'Distance Matrix returned an invalid duration');

  return {
    distanceKm: distanceMeters / 1000,
    durationMinutes: Math.ceil(durationSeconds / 60),
  };
}

export function calculateAuthoritativeMonthlyDistanceKm(input: {
  outboundKm: number;
  returnKm: number;
  tripType: 'one_way' | 'round_trip';
  occurrences: number;
}): number {
  assertPositiveFinite(input.outboundKm, 'Invalid outbound route distance');
  if (!Number.isFinite(input.returnKm) || input.returnKm < 0) throw new Error('Invalid return route distance');
  if (input.tripType === 'round_trip') assertPositiveFinite(input.returnKm, 'Round-trip return distance is required');
  if (!Number.isInteger(input.occurrences) || input.occurrences <= 0) throw new Error('Invalid weekday occurrence count');

  const perOccurrenceKm = input.tripType === 'round_trip'
    ? input.outboundKm + input.returnKm
    : input.outboundKm;
  return Math.round(perOccurrenceKm * input.occurrences * 10) / 10;
}
