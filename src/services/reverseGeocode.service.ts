/**
 * Reverse-geocoding multi-niveaux : Google Maps Geocoder côté client
 * (rapide, gratuit) avec fallback Cloud Function `reverseGeocode`
 * (clé API serveur, fiable y compris sur WebView Android où le mode Promise
 * du SDK peut échouer silencieusement).
 *
 * Ne lève jamais d'exception : retourne null si les deux niveaux échouent.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { withTimeout } from '@/utils/promise';

interface ReverseGeocodeOptions {
    clientTimeoutMs?: number;
    serverTimeoutMs?: number;
}

interface ServerResult {
    address: string;
    place_id: string;
    results: unknown[];
}

let cachedGeocoder: google.maps.Geocoder | null = null;

function getGeocoder(): google.maps.Geocoder | null {
    if (typeof window === 'undefined' || !window.google?.maps?.Geocoder) return null;
    if (!cachedGeocoder) cachedGeocoder = new window.google.maps.Geocoder();
    return cachedGeocoder;
}

function clientGeocode(lat: number, lng: number, timeoutMs: number): Promise<string | null> {
    const geocoder = getGeocoder();
    if (!geocoder) return Promise.resolve(null);

    const geocodePromise = new Promise<string | null>((resolve, reject) => {
        try {
            // API callback : universelle, contrairement au mode Promise qui peut
            // retourner undefined sur certaines WebView Android.
            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                if (status === 'OK' && results && results[0]) {
                    resolve(results[0].formatted_address);
                } else if (status === 'ZERO_RESULTS') {
                    resolve(null);
                } else {
                    reject(new Error(`Client geocode status: ${status}`));
                }
            });
        } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
        }
    });

    return withTimeout(geocodePromise, timeoutMs, 'Client geocode');
}

async function serverGeocode(lat: number, lng: number, timeoutMs: number): Promise<string | null> {
    const fn = httpsCallable<{ lat: number; lng: number }, ServerResult>(functions, 'reverseGeocode');
    const result = await withTimeout(fn({ lat, lng }), timeoutMs, 'Server geocode');
    return result.data?.address ?? null;
}

export async function reverseGeocodeAddress(
    lat: number,
    lng: number,
    options: ReverseGeocodeOptions = {}
): Promise<string | null> {
    const { clientTimeoutMs = 4000, serverTimeoutMs = 5000 } = options;

    try {
        const clientAddress = await clientGeocode(lat, lng, clientTimeoutMs);
        if (clientAddress) return clientAddress;
    } catch (err) {
        console.warn('[reverseGeocode] Client échoué, fallback serveur:', err instanceof Error ? err.message : err);
    }

    try {
        const serverAddress = await serverGeocode(lat, lng, serverTimeoutMs);
        if (serverAddress) return serverAddress;
    } catch (err) {
        console.warn('[reverseGeocode] Serveur échoué:', err instanceof Error ? err.message : err);
    }

    return null;
}
