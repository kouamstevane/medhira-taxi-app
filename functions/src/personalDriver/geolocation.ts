import { defineInt } from 'firebase-functions/params';

export interface PersonalDriverCoordinate {
  latitude: number;
  longitude: number;
}

const maxDistanceMetersParam = defineInt('PERSONAL_DRIVER_ARRIVAL_MAX_DISTANCE_METERS');
const maxAccuracyMetersParam = defineInt('PERSONAL_DRIVER_ARRIVAL_MAX_ACCURACY_METERS');

export interface PersonalDriverArrivalGpsConfig {
  maxDistanceMeters: number;
  maxAccuracyMeters: number;
}

export function getPersonalDriverArrivalGpsConfig(): PersonalDriverArrivalGpsConfig {
  const maxDistanceMeters = maxDistanceMetersParam.value();
  const maxAccuracyMeters = maxAccuracyMetersParam.value();
  if (!Number.isInteger(maxDistanceMeters) || maxDistanceMeters <= 0) {
    throw new Error('Personal Driver arrival distance threshold is not configured');
  }
  if (!Number.isInteger(maxAccuracyMeters) || maxAccuracyMeters <= 0) {
    throw new Error('Personal Driver arrival accuracy threshold is not configured');
  }
  return Object.freeze({ maxDistanceMeters, maxAccuracyMeters });
}

function assertCoordinate(coordinate: PersonalDriverCoordinate): void {
  if (
    !Number.isFinite(coordinate.latitude)
    || !Number.isFinite(coordinate.longitude)
    || coordinate.latitude < -90
    || coordinate.latitude > 90
    || coordinate.longitude < -180
    || coordinate.longitude > 180
  ) {
    throw new Error('Invalid GPS coordinates');
  }
}

export function getDistanceMeters(
  first: PersonalDriverCoordinate,
  second: PersonalDriverCoordinate,
): number {
  assertCoordinate(first);
  assertCoordinate(second);
  const earthRadiusMeters = 6371008.8;
  const latitudeDelta = (second.latitude - first.latitude) * Math.PI / 180;
  const longitudeDelta = (second.longitude - first.longitude) * Math.PI / 180;
  const firstLatitude = first.latitude * Math.PI / 180;
  const secondLatitude = second.latitude * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function assertDriverNearPickup(
  driverLocation: PersonalDriverCoordinate,
  pickupLocation: PersonalDriverCoordinate,
  accuracyMeters: number,
  config = getPersonalDriverArrivalGpsConfig(),
): void {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > config.maxAccuracyMeters) {
    throw new Error('GPS accuracy is insufficient');
  }
  if (getDistanceMeters(driverLocation, pickupLocation) > config.maxDistanceMeters) {
    throw new Error('Driver is outside the pickup radius');
  }
}
