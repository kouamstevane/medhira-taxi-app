import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

const DEFAULT_REDIRECT_TIMEOUT = 3000;

export interface RedirectOptions {
  timeoutMs?: number;
}

export function redirectWithFallback(
  router: AppRouterInstance,
  url: string,
  options?: RedirectOptions
): NodeJS.Timeout | null {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_REDIRECT_TIMEOUT;

  try {
    router.push(url);
  } catch (err: unknown) {
    console.warn('[Navigation] router.push failed:', err);
  }

  const fallbackTimeout = setTimeout(() => {
    if (typeof window !== 'undefined' && window.location.pathname !== url) {
      window.location.replace(url);
    }
  }, timeoutMs);

  return fallbackTimeout;
}
