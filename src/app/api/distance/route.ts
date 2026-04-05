import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy serveur vers l'API Google Maps Distance Matrix.
 * Évite les erreurs CORS et les restrictions de clé API côté navigateur.
 * GET /api/distance?origin=...&destination=...
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get('origin');
  const destination = searchParams.get('destination');

  if (!origin || !destination) {
    return NextResponse.json({ error: 'Paramètres origin et destination requis' }, { status: 400 });
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Clé API non configurée' }, { status: 500 });
  }

  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${origin}&destinations=${destination}&mode=driving&language=fr&key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/distance] Erreur Distance Matrix:', err);
    return NextResponse.json({ error: 'Erreur lors de la requête Distance Matrix' }, { status: 502 });
  }
}
