import { getDirections } from '@/services/directions.service';
import { translate } from '@/locales';

export const getDistanceEstimateErrorMessage = (): string =>
  translate('systemMessages.ui.distanceEstimateFailed');

export class DistanceEstimateError extends Error {
  constructor() {
    super(getDistanceEstimateErrorMessage());
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
