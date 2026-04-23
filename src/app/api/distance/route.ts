import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/admin-guard';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Proxy serveur vers l'API Google Maps Distance Matrix.
 * Évite les erreurs CORS et les restrictions de clé API côté navigateur.
 * GET /api/distance?origin=lat,lng&destination=lat,lng
 */

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const LATLNG_RE = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;
const MAX_PARAM_LEN = 200;
// Reject control chars and URL-structural chars that have no business in an address.
// URLSearchParams.set() handles encoding, so injection isn't the concern — this is a sanity cap.
const FORBIDDEN_CHARS = /[\x00-\x1F\x7F&?#=]/;

function isValidLocationParam(v: string): boolean {
  if (!v || v.length > MAX_PARAM_LEN) return false;
  if (FORBIDDEN_CHARS.test(v)) return false;
  if (LATLNG_RE.test(v)) {
    const [latStr, lngStr] = v.split(',');
    const lat = Number(latStr);
    const lng = Number(lngStr);
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
  return true;
}

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await verifyFirebaseToken(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const rl = checkRateLimit({ identifier: userId, bucket: 'api:distance', limit: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Trop de requêtes. Réessayez plus tard.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } });
  }

  const { searchParams } = new URL(request.url);
  const origin = searchParams.get('origin');
  const destination = searchParams.get('destination');

  if (!origin || !destination) {
    return NextResponse.json({ error: 'Paramètres origin et destination requis' }, { status: 400 });
  }

  if (!isValidLocationParam(origin) || !isValidLocationParam(destination)) {
    return NextResponse.json(
      { error: 'origin/destination invalides' },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Clé API non configurée' }, { status: 500 });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', origin);
  url.searchParams.set('destinations', destination);
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('language', 'fr');
  url.searchParams.set('key', apiKey);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/distance] Erreur Distance Matrix:', err);
    return NextResponse.json({ error: 'Erreur lors de la requête Distance Matrix' }, { status: 502 });
  }
}
