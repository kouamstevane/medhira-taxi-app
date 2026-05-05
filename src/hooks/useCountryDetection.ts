import { useState, useEffect, useMemo, useRef } from 'react';
import { haversineKm } from '@/utils/distance';
import { getMarketByCountryCode, MARKET_CONFIGS, type MarketCode } from '@/utils/constants';
import { secureStorage } from '@/services/secureStorage.service';

interface UseCountryDetectionReturn {
  country: MarketCode | null;
  isSupported: boolean;
  loading: boolean;
  error: string | null;
}

interface UseCountryDetectionProps {
  location: { lat: number; lng: number } | null;
  enabled?: boolean;
}

interface CachedCountry {
  country: MarketCode;
  lat: number;
  lng: number;
  timestamp: number;
}

function detectByBoundingBox(location: { lat: number; lng: number }): MarketCode | null {
  for (const [code, config] of Object.entries(MARKET_CONFIGS)) {
    const { latMin, latMax, lngMin, lngMax } = config.boundingBox;
    if (
      location.lat >= latMin &&
      location.lat <= latMax &&
      location.lng >= lngMin &&
      location.lng <= lngMax
    ) {
      return code as MarketCode;
    }
  }
  return null;
}

async function reverseGeocodeCountry(
  location: { lat: number; lng: number }
): Promise<MarketCode | null> {
  if (!window.google?.maps?.Geocoder) return null;

  const geocoder = new window.google.maps.Geocoder();

  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), 3000)
  );

  const geocodePromise = new Promise<MarketCode | null>((resolve) => {
    geocoder.geocode({ location }, (results, status) => {
      if (status !== 'OK' || !results || results.length === 0) {
        resolve(null);
        return;
      }
      const countryComp = results[0].address_components.find((c) =>
        c.types.includes('country')
      );
      if (!countryComp) {
        resolve(null);
        return;
      }
      const match = getMarketByCountryCode(countryComp.short_name);
      resolve(match?.code ?? null);
    });
  });

  return Promise.race([geocodePromise, timeoutPromise]);
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const DISTANCE_THRESHOLD_KM = 1;

export function useCountryDetection({
  location,
  enabled = false,
}: UseCountryDetectionProps): UseCountryDetectionReturn {
  const memoizedLocation = useMemo<typeof location>(
    () => (location ? { lat: location.lat, lng: location.lng } : null),
    [location?.lat, location?.lng]
  );

  const [country, setCountry] = useState<MarketCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memCacheRef = useRef<CachedCountry | null>(null);
  const isDetectingRef = useRef(false);

  useEffect(() => {
    secureStorage.getItem<CachedCountry>('detected_country').then((cached) => {
      if (cached) memCacheRef.current = cached;
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!memoizedLocation || !enabled) {
      setCountry(null);
      setLoading(false);
      return;
    }

    if (isDetectingRef.current) return;

    const cached = memCacheRef.current;
    if (
      cached &&
      Date.now() - cached.timestamp < CACHE_TTL_MS &&
      haversineKm(
        { lat: cached.lat, lng: cached.lng },
        { lat: memoizedLocation.lat, lng: memoizedLocation.lng }
      ) < DISTANCE_THRESHOLD_KM
    ) {
      setCountry(cached.country);
      return;
    }

    let cancelled = false;
    isDetectingRef.current = true;
    setLoading(true);

    (async () => {
      try {
        const fastResult = detectByBoundingBox(memoizedLocation);
        if (fastResult && !cancelled) setCountry(fastResult);

        const slowResult = await reverseGeocodeCountry(memoizedLocation);
        if (!cancelled) {
          const final = slowResult ?? fastResult;
          if (final) {
            setCountry(final);
            const newCache: CachedCountry = {
              country: final,
              ...memoizedLocation,
              timestamp: Date.now(),
            };
            memCacheRef.current = newCache;
            secureStorage
              .setItem('detected_country', newCache, { ttl: CACHE_TTL_MS })
              .catch(() => {});
          } else {
            setCountry(null);
          }
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Detection failed');
      } finally {
        if (!cancelled) {
          setLoading(false);
          isDetectingRef.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
      isDetectingRef.current = false;
    };
  }, [memoizedLocation, enabled]);

  return { country, isSupported: country !== null, loading, error };
}
