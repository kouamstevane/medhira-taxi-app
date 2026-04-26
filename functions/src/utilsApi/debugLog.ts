/**
 * Cloud Function — debugLog
 *
 * Endpoint admin de logging d'erreurs client.
 * Migration de Next.js POST /api/debug/log vers onCall pour Capacitor mobile.
 *
 * Auth obligatoire + restriction admin (parité avec la route Next).
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from '../utils/rateLimiter.js';

interface DebugLogPayload {
  message?: string;
  code?: string;
  stack?: string;
  context?: unknown;
}

export const debugLog = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<DebugLogPayload>): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise.');
    }

    const uid = request.auth.uid;

    await enforceRateLimit({
      identifier: uid,
      bucket: 'utils:debugLog',
      limit: 60,
      windowSec: 60,
    });

    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();

    const adminDoc = await db.collection('admins').doc(uid).get();
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'Forbidden: admin access required.');
    }

    const body = request.data ?? {};
    console.error('\x1b[31m%s\x1b[0m', '--- CLIENT ERROR LOG ---');
    console.error('Message:', body.message);
    console.error('Code:', body.code);
    if (body.stack) console.error('Stack:', body.stack);
    if (body.context) console.error('Context:', body.context);
    console.error('\x1b[31m%s\x1b[0m', '------------------------');

    return { success: true };
  }
);
