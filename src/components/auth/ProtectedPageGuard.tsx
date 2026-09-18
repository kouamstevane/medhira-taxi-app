'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { NetworkErrorView } from '@/components/ui/NetworkErrorView';
import { redirectWithFallback } from '@/utils/navigation';
import { useTranslation } from '@/hooks/useTranslation';

const PROTECTED_GUARD_TIMEOUT_MS = 13_000;

interface ProtectedPageGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export function ProtectedPageGuard({
  children,
  redirectTo = '/login',
}: ProtectedPageGuardProps) {
  const router = useRouter();
  const { authStatus, reloadUser } = useAuth();
  const { t } = useTranslation();
  const redirectedRef = useRef(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const isWaiting = authStatus === 'loading' || authStatus === 'degraded';

  useEffect(() => {
    if (!isWaiting) {
      setHasTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setHasTimedOut(true);
    }, PROTECTED_GUARD_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [isWaiting, retryCount]);

  const handleRetry = useCallback(async () => {
    setHasTimedOut(false);
    setRetryCount((prev) => prev + 1);
    try {
      if (reloadUser) {
        await reloadUser();
      } else if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch {
      // Retrying in offline mode may fail, timeout will re-trigger
    }
  }, [reloadUser]);

  useEffect(() => {
    if (authStatus !== 'unauthenticated' || redirectedRef.current) {
      return;
    }

    redirectedRef.current = true;
    redirectWithFallback(router, redirectTo);
  }, [authStatus, redirectTo, router]);

  if (authStatus === 'authenticated') {
    return <>{children}</>;
  }

  if (hasTimedOut) {
    return (
      <NetworkErrorView
        fullScreen
        title={t('common.offlineTitle')}
        message={t('common.offlineDescription')}
        onRetry={handleRetry}
        retryLabel={t('common.retry')}
        autoRetryOnReconnect
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="relative w-24 h-24 mx-auto mb-8">
          <div className="absolute inset-0 bg-primary rounded-full opacity-20 animate-ping" />
          <div className="relative w-24 h-24 bg-primary rounded-full flex items-center justify-center shadow-2xl animate-pulse">
            <MaterialIcon name="local_taxi" className="text-white text-[40px]" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Medjira</h2>
        <p className="text-muted-foreground animate-pulse">
          {authStatus === 'degraded'
            ? 'Connexion temporairement indisponible...'
            : authStatus === 'loading'
              ? 'Chargement...'
              : 'Redirection...'}
        </p>
      </div>
    </div>
  );
}
