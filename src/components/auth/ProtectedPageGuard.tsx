'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { redirectWithFallback } from '@/utils/navigation';

interface ProtectedPageGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export function ProtectedPageGuard({
  children,
  redirectTo = '/login',
}: ProtectedPageGuardProps) {
  const router = useRouter();
  const { authStatus } = useAuth();
  const redirectedRef = useRef(false);

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
          {authStatus === 'loading' ? 'Chargement...' : 'Redirection...'}
        </p>
      </div>
    </div>
  );
}
