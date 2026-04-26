/**
 * Simple in-memory rate limiter for Next.js API routes.
 *
 * Uses a sliding-window counter per (bucket, identifier). Each request
 * increments the counter; if it exceeds `limit` within `windowMs`, the
 * request is rejected with 429.
 *
 * Not as robust as the Firestore-backed limiter used by Cloud Functions
 * (cold starts reset state, no cross-instance coordination), but provides
 * meaningful protection against basic abuse at zero infra cost.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const store = new Map<string, Bucket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) {
    if (now - bucket.windowStart > 60_000) {
      store.delete(key);
    }
  }
}, 60_000);

export interface RateLimitOpts {
  identifier: string;
  bucket: string;
  limit: number;
  windowMs: number;
}

export function checkRateLimit(opts: RateLimitOpts): { allowed: boolean; retryAfterMs: number } {
  const { identifier, bucket, limit, windowMs } = opts;
  const key = `${bucket}:${identifier}`;
  const now = Date.now();

  let entry = store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { count: 1, windowStart: now };
    store.set(key, entry);
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= limit) {
    const retryAfterMs = windowMs - (now - entry.windowStart);
    return { allowed: false, retryAfterMs };
  }

  entry.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}
