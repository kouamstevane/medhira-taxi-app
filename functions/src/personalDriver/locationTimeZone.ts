import { defineSecret } from 'firebase-functions/params';

const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');
const MAX_ADDRESS_LENGTH = 500;
const CALENDAR_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

interface Coordinates {
  latitude: number;
  longitude: number;
}

function assertValidAddress(address: string): void {
  if (!address.trim() || address.length > MAX_ADDRESS_LENGTH || /[\x00-\x1F\x7F]/.test(address)) {
    throw new Error('Invalid address');
  }
}

function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
  } catch {
    throw new Error('Invalid timezone');
  }
}

function assertValidCoordinates(coordinates: Coordinates): void {
  if (
    !Number.isFinite(coordinates.latitude)
    || !Number.isFinite(coordinates.longitude)
    || coordinates.latitude < -90
    || coordinates.latitude > 90
    || coordinates.longitude < -180
    || coordinates.longitude > 180
  ) {
    throw new Error('Invalid coordinates');
  }
}

async function fetchJson(url: URL): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Google request failed');
  const data = await response.json() as Record<string, unknown>;
  if (!data || typeof data !== 'object') throw new Error('Invalid Google response');
  return data;
}

async function geocodeAddress(address: string): Promise<Coordinates> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('language', 'fr');
  url.searchParams.set('key', googleMapsApiKey.value());
  const data = await fetchJson(url);
  const results = Array.isArray(data.results) ? data.results : [];
  if (data.status !== 'OK' || results.length !== 1) throw new Error('Address could not be resolved uniquely');

  const result = results[0] as Record<string, unknown>;
  if (result.partial_match === true) throw new Error('Address resolution was partial');
  const geometry = result.geometry as Record<string, unknown> | undefined;
  const location = geometry?.location as Record<string, unknown> | undefined;
  const coordinates = {
    latitude: Number(location?.lat),
    longitude: Number(location?.lng),
  };
  assertValidCoordinates(coordinates);
  return coordinates;
}

export async function resolveAddressCoordinates(address: string): Promise<Coordinates> {
  assertValidAddress(address);
  return geocodeAddress(address);
}

async function resolveTimeZone(coordinates: Coordinates, referenceInstant: Date): Promise<string> {
  const url = new URL('https://maps.googleapis.com/maps/api/timezone/json');
  url.searchParams.set('location', `${coordinates.latitude},${coordinates.longitude}`);
  url.searchParams.set('timestamp', String(Math.floor(referenceInstant.getTime() / 1000)));
  url.searchParams.set('key', googleMapsApiKey.value());
  const data = await fetchJson(url);
  if (data.status !== 'OK' || typeof data.timeZoneId !== 'string') throw new Error('Timezone could not be resolved');
  assertValidTimeZone(data.timeZoneId);
  return data.timeZoneId;
}

export async function resolvePickupLocationAndTimeZone(
  address: string,
  referenceInstant: Date,
): Promise<Coordinates & { serviceTimeZone: string }> {
  if (!Number.isFinite(referenceInstant.getTime())) throw new Error('Invalid reference instant');
  const coordinates = await resolveAddressCoordinates(address);
  const serviceTimeZone = await resolveTimeZone(coordinates, referenceInstant);
  return { ...coordinates, serviceTimeZone };
}

function getLocalParts(instant: Date, serviceTimeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: serviceTimeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

function getOffsetMilliseconds(instant: Date, serviceTimeZone: string): number {
  const local = getLocalParts(instant, serviceTimeZone);
  const localAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  return localAsUtc - instant.getTime();
}

function matchesLocalDateTime(instant: Date, localDateTime: string, serviceTimeZone: string): boolean {
  const match = CALENDAR_DATE_TIME_PATTERN.exec(localDateTime);
  if (!match) return false;
  const local = getLocalParts(instant, serviceTimeZone);
  return [
    Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]), 0,
  ].every((value, index) => value === [local.year, local.month, local.day, local.hour, local.minute, local.second][index]);
}

export function getLocalCalendarDate(instant: Date, serviceTimeZone: string): string {
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid instant');
  assertValidTimeZone(serviceTimeZone);
  const local = getLocalParts(instant, serviceTimeZone);
  return [
    local.year,
    String(local.month).padStart(2, '0'),
    String(local.day).padStart(2, '0'),
  ].join('-');
}

export function localDateTimeToUtc(localDate: string, localTime: string, serviceTimeZone: string): Date {
  const localDateTime = `${localDate}T${localTime}`;
  const match = CALENDAR_DATE_TIME_PATTERN.exec(localDateTime);
  if (!match) throw new Error('Invalid local date/time');
  assertValidTimeZone(serviceTimeZone);

  const wallClockAsUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  const candidateOffsets = new Set<number>();
  for (let offset = -14; offset <= 14; offset += 1) {
    candidateOffsets.add(getOffsetMilliseconds(new Date(wallClockAsUtc + offset * 60 * 60 * 1000), serviceTimeZone));
  }

  const candidates = [...candidateOffsets]
    .map((offset) => new Date(wallClockAsUtc - offset))
    .filter((candidate) => matchesLocalDateTime(candidate, localDateTime, serviceTimeZone));
  if (candidates.length !== 1) throw new Error('Local date/time is ambiguous or does not exist');
  return candidates[0];
}
