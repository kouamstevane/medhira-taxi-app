/**
 * Service Directions partagé avec cache mémoire + déduplication des in-flight.
 *
 * Chaque appel à google.maps.DirectionsService est facturé ($5–$10/1000).
 * Ce service mémoïse les résultats pour un couple (origin, destination, mode)
 * pendant TTL_MS et dédupplique les requêtes identiques en vol. Le gain
 * principal vient des remounts (StrictMode, navigation) et des appels parallèles
 * — pas du tracking GPS (les coords changent assez vite pour produire de
 * nouvelles clés malgré l'arrondi à 4 décimales).
 *
 * Coordonnées arrondies à 4 décimales (~11 m) pour grouper les ticks proches.
 */

export type Endpoint = string | google.maps.LatLngLiteral;

interface DirectionsRequest {
    origin: Endpoint;
    destination: Endpoint;
    travelMode?: google.maps.TravelMode;
    provideRouteAlternatives?: boolean;
}

export type DirectionsErrorCode =
    | 'ZERO_RESULTS'
    | 'NOT_FOUND'
    | 'OVER_QUERY_LIMIT'
    | 'REQUEST_DENIED'
    | 'INVALID_REQUEST'
    | 'UNKNOWN_ERROR'
    | 'API_NOT_LOADED';

export class DirectionsError extends Error {
    constructor(public code: DirectionsErrorCode, message: string) {
        super(message);
        this.name = 'DirectionsError';
    }
}

const TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const cache = new Map<string, { result: google.maps.DirectionsResult; expiresAt: number }>();
const inflight = new Map<string, Promise<google.maps.DirectionsResult>>();

function serializeEndpoint(e: Endpoint): string {
    return typeof e === 'string'
        ? e.trim().toLowerCase()
        : `${e.lat.toFixed(4)},${e.lng.toFixed(4)}`;
}

function cacheKey(req: DirectionsRequest): string {
    return [
        serializeEndpoint(req.origin),
        serializeEndpoint(req.destination),
        req.travelMode ?? 'DRIVING',
        req.provideRouteAlternatives ? '1' : '0',
    ].join('|');
}

function ensureMapsLoaded(): void {
    if (typeof window === 'undefined' || !window.google?.maps?.DirectionsService) {
        throw new DirectionsError('API_NOT_LOADED', 'Google Maps API non chargée');
    }
}

function purgeExpired(now: number): void {
    for (const [key, entry] of cache) {
        if (entry.expiresAt <= now) cache.delete(key);
    }
    // Plafond LRU-ish : si on dépasse encore, on dégage les plus anciennes
    // (Map garde l'ordre d'insertion).
    while (cache.size > MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}

function mapGoogleError(err: unknown): DirectionsError {
    if (err instanceof DirectionsError) return err;
    // L'API v3 rejette avec un objet `{ code: DirectionsStatus }` ou une Error
    // dont message contient le statut. On essaie les deux.
    const code = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : String(err);
    const knownCodes: DirectionsErrorCode[] = [
        'ZERO_RESULTS',
        'NOT_FOUND',
        'OVER_QUERY_LIMIT',
        'REQUEST_DENIED',
        'INVALID_REQUEST',
    ];
    const matched = knownCodes.find((c) => c === code || message.includes(c));
    return new DirectionsError(matched ?? 'UNKNOWN_ERROR', message);
}

/**
 * Récupère un itinéraire en réutilisant le cache si possible.
 * Les requêtes identiques en vol sont dédupliquées (un seul appel facturé).
 *
 * Rejette avec une `DirectionsError` au code typé en cas d'échec.
 */
export async function getDirections(
    req: DirectionsRequest
): Promise<google.maps.DirectionsResult> {
    ensureMapsLoaded();

    const key = cacheKey(req);
    const now = Date.now();

    purgeExpired(now);

    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
        return cached.result;
    }

    const pending = inflight.get(key);
    if (pending) return pending;

    const service = new window.google.maps.DirectionsService();
    const promise = service
        .route({
            origin: req.origin,
            destination: req.destination,
            travelMode: req.travelMode ?? window.google.maps.TravelMode.DRIVING,
            provideRouteAlternatives: req.provideRouteAlternatives ?? false,
        })
        .then((result) => {
            if (!result.routes || result.routes.length === 0) {
                throw new DirectionsError('ZERO_RESULTS', 'Aucun itinéraire trouvé');
            }
            cache.set(key, { result, expiresAt: Date.now() + TTL_MS });
            return result;
        })
        .catch((err) => {
            throw mapGoogleError(err);
        })
        .finally(() => {
            inflight.delete(key);
        });

    inflight.set(key, promise);
    return promise;
}

/** Vide le cache (utile pour les tests). */
export function clearDirectionsCache(): void {
    cache.clear();
    inflight.clear();
}
