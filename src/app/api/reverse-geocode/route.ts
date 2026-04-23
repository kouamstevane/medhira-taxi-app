import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/admin-guard';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

export async function GET(request: NextRequest) {
    let userId: string;
    try {
        userId = await verifyFirebaseToken(request);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unauthorized';
        return NextResponse.json({ error: message }, { status: 401 });
    }

    const rl = checkRateLimit({ identifier: userId, bucket: 'api:reverse-geocode', limit: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });
    if (!rl.allowed) {
        return NextResponse.json({ error: 'Trop de requêtes. Réessayez plus tard.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } });
    }

    const { searchParams } = new URL(request.url);
    const latRaw = searchParams.get('lat');
    const lngRaw = searchParams.get('lng');
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

    if (!latRaw || !lngRaw) {
        return NextResponse.json({ error: 'Latitude and longitude are required' }, { status: 400 });
    }

    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
    ) {
        return NextResponse.json({ error: 'Invalid latitude or longitude' }, { status: 400 });
    }

    if (!apiKey) {
        return NextResponse.json({ error: 'API Key not configured' }, { status: 500 });
    }

    try {
        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        url.searchParams.set('latlng', `${lat},${lng}`);
        url.searchParams.set('key', apiKey);

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.status === 'OK' && data.results && data.results.length > 0) {
            return NextResponse.json({
                address: data.results[0].formatted_address,
                place_id: data.results[0].place_id,
                results: data.results
            });
        } else {
            console.warn('[api/reverse-geocode] No results', { status: data?.status });
            return NextResponse.json({ error: 'No results found' }, { status: 404 });
        }
    } catch (error: unknown) {
        console.error('[api/reverse-geocode] Erreur Geocoding:', error);
        return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
    }
}
