import { getDirections } from '@/services/directions.service';

export const DISTANCE_ESTIMATE_ERROR_MESSAGE =
  'Impossible de calculer la distance. Verifiez les adresses puis reessayez.';

export class DistanceEstimateError extends Error {
  constructor() {
    super(DISTANCE_ESTIMATE_ERROR_MESSAGE);
    this.name = 'DistanceEstimateError';
  }
}

export async function estimateRoadDistanceKm(origin: string, destination: string): Promise<number> {
  if (!origin.trim() || !destination.trim()) {
    throw new DistanceEstimateError();
  }

  try {
    const directions = await getDirections({ origin, destination });
    const distanceMeters = directions.routes[0]?.legs.reduce(
      (total, leg) => total + (leg.distance?.value ?? 0),
      0,
    );

    if (!distanceMeters || distanceMeters <= 0) {
      throw new DistanceEstimateError();
    }

    return distanceMeters / 1000;
  } catch {
    throw new DistanceEstimateError();
  }
}
