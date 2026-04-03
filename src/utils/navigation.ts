// src/utils/navigation.ts
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { StructuredLogger } from './logger';

export async function redirectWithFallback(
  router: AppRouterInstance,
  url: string,
  logger: StructuredLogger,
  isMountedRef: React.MutableRefObject<boolean>,
  redirectTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
): Promise<void> {
  logger.logStart('REDIRECTION', { url, method: 'router.push' });

  try {
    await router.push(url);
    logger.logSuccess('REDIRECTION', { url, method: 'router.push' });

    redirectTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;

      if (
        typeof window !== 'undefined' &&
        window.location.pathname.includes('/driver/register')
      ) {
        logger.logWarning('REDIRECTION', 'router.push() a échoué, fallback vers window.location.href', {
          currentPath: window.location.pathname,
          intendedUrl: url,
        });
        window.location.href = url;
      }
    }, 5000);
  } catch (error) {
    logger.logError('REDIRECTION', error as Error, { url });
    window.location.href = url;
  }
}
