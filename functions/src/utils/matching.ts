// functions/src/utils/matching.ts
/**
 * Utilitaire de matching géographique livreur.
 * Calcul Haversine — même formule que src/services/matching/findAvailableDrivers.ts
 */

export interface DriverCandidate {
  id: string
  data: Record<string, unknown>
  loc: { lat: number; lng: number }
}

const EARTH_RADIUS_M = 6371000
const MAX_DISTANCE_KM = 15

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function selectNearestDriver(
  candidates: DriverCandidate[],
  target: { lat: number; lng: number }
): DriverCandidate | null {
  const withDistance = candidates
    .map((c) => ({
      ...c,
      distanceM: haversineDistance(c.loc.lat, c.loc.lng, target.lat, target.lng),
    }))
    .filter((c) => c.distanceM <= MAX_DISTANCE_KM * 1000)
    .sort((a, b) => {
      if (Math.abs(a.distanceM - b.distanceM) < 100) {
        // Tie-break : meilleur rating
        return ((b.data.rating as number) ?? 0) - ((a.data.rating as number) ?? 0)
      }
      return a.distanceM - b.distanceM
    })

  return withDistance[0] ?? null
}
