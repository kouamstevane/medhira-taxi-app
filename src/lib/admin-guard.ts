/**
 * Helpers partagés pour les routes API nécessitant Firebase Admin SDK.
 * @module lib/admin-guard
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth as _adminAuth, adminDb as _adminDb } from '@/config/firebase-admin';

/** Retourne adminAuth ou lève une réponse 503 */
export function getAdminAuth() {
  if (!_adminAuth) throw new Error('SERVICE_UNAVAILABLE');
  return _adminAuth;
}

/** Retourne adminDb ou lève une réponse 503 */
export function getAdminDb() {
  if (!_adminDb) throw new Error('SERVICE_UNAVAILABLE');
  return _adminDb;
}

/** Vérifie le token Bearer Firebase et retourne l'uid */
export async function verifyFirebaseToken(request: NextRequest): Promise<string> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new Error('Token d\'authentification manquant');
  }
  const token = authorization.slice(7);
  const decoded = await getAdminAuth().verifyIdToken(token);
  return decoded.uid;
}

/** Réponse standard 503 quand Firebase Admin n'est pas initialisé */
export function adminUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Service temporairement indisponible — Firebase Admin SDK non initialisé' },
    { status: 503 }
  );
}
