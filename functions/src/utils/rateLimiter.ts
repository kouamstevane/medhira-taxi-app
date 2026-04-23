/**
 * Persistent, cross-instance rate limiter backed by Firestore.
 *
 * Why Firestore:
 * - Already used project-wide (no new infra).
 * - Survives cold starts and horizontal scaling (unlike a module-scope Map,
 *   which each Cloud Function instance owns in isolation and can be bypassed
 *   by triggering new instances).
 *
 * Concurrency: all read-check-increment sequences run inside a
 * `runTransaction` to avoid race conditions between instances.
 *
 * TTL / cleanup:
 *   Configure Firestore TTL on `rateLimits.expiresAt` in the GCP Console
 *   (Firestore -> TTL policies). This is a manual deploy step, not code.
 *
 * Performance note:
 *   Each check is one Firestore transaction (~20-80ms). For extremely hot
 *   paths, an in-memory LRU can sit in front of this as an optimization
 *   (probabilistic fast-path + Firestore as source of truth). NOT implemented
 *   here per YAGNI.
 */

import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

interface RateLimitDoc {
  count: number;
  windowStart: number;
  expiresAt: admin.firestore.Timestamp;
}

export interface RateLimitOptions {
  /** Stable identifier — typically `auth.uid` or the caller IP. */
  identifier: string;
  /** Logical bucket — e.g. `"voip:createCall"`, `"stripe:setupIntent"`. */
  bucket: string;
  /** Max allowed requests per window. */
  limit: number;
  /** Window size in seconds. */
  windowSec: number;
  /** Optional custom message thrown on limit breach. */
  message?: string;
}

/**
 * Atomically checks and increments the rate-limit counter for
 * `(bucket, identifier)`. Throws `HttpsError('resource-exhausted', ...)`
 * when the caller has exceeded the configured limit.
 *
 * Fail-secure: if the transaction itself fails (Firestore outage, etc.),
 * we re-throw `HttpsError('unavailable', ...)` rather than silently
 * allow the request — rate limiting is a security control.
 */
export async function enforceRateLimit(opts: RateLimitOptions): Promise<void> {
  const { identifier, bucket, limit, windowSec } = opts;

  if (!identifier) {
    // Callers should always pass a non-empty identifier. Fall back to
    // a deterministic constant so unidentified callers share a single
    // bucket (collective limit) rather than bypassing entirely.
    // Kept as a defensive guard.
    throw new HttpsError('invalid-argument', 'Rate limiter identifier manquant.');
  }

  const db = admin.firestore();
  const docId = `${bucket}__${identifier}`.replace(/[^a-zA-Z0-9_:@.-]/g, '_');
  const docRef = db.collection('rateLimits').doc(docId);
  const windowMs = windowSec * 1000;
  const now = Date.now();

  try {
    const blocked = await db.runTransaction<boolean>(async (tx) => {
      const snap = await tx.get(docRef);
      const expiresAt = admin.firestore.Timestamp.fromMillis(now + windowMs);

      if (!snap.exists) {
        const fresh: RateLimitDoc = {
          count: 1,
          windowStart: now,
          expiresAt,
        };
        tx.set(docRef, fresh);
        return false;
      }

      const data = snap.data() as RateLimitDoc;
      const elapsed = now - (data.windowStart ?? 0);

      // Window rolled over — reset counter.
      if (elapsed >= windowMs) {
        tx.set(docRef, {
          count: 1,
          windowStart: now,
          expiresAt,
        } satisfies RateLimitDoc);
        return false;
      }

      if ((data.count ?? 0) >= limit) {
        return true;
      }

      tx.update(docRef, {
        count: admin.firestore.FieldValue.increment(1),
        // Refresh expiresAt so TTL doesn't drop the doc mid-window.
        expiresAt,
      });
      return false;
    });

    if (blocked) {
      throw new HttpsError(
        'resource-exhausted',
        opts.message ?? `Trop de requêtes (${bucket}). Réessayez plus tard.`,
      );
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error(`[rateLimiter] Transaction failure for ${bucket}/${identifier}:`, err);
    // Fail-secure: deny on infra failure.
    throw new HttpsError(
      'unavailable',
      'Service temporairement indisponible. Réessayez dans un instant.',
    );
  }
}

/**
 * Boolean variant — returns `true` if the request is allowed, `false`
 * if rate-limited. Preserves the legacy `RateLimiter.check()` API
 * used by `validateBankDetails`, `encryptSensitiveData` and
 * `createDriverProfile` in functions/src/index.ts.
 */
export async function checkRateLimit(opts: RateLimitOptions): Promise<boolean> {
  try {
    await enforceRateLimit(opts);
    return true;
  } catch (err) {
    if (err instanceof HttpsError && err.code === 'resource-exhausted') {
      return false;
    }
    throw err;
  }
}
