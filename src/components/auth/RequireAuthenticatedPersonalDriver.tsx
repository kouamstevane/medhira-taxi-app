'use client';

import React, { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';
import type { UserData } from '@/types/user';

export interface RequireAuthenticatedPersonalDriverProps {
  role?: 'client' | 'driver' | 'admin';
  children: React.ReactNode;
}

export function RequireAuthenticatedPersonalDriver({
  role,
  children,
}: RequireAuthenticatedPersonalDriverProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { currentUser, userData, loading, authStatus } = useAuth();
  const isRedirectingRef = useRef(false);

  const isAuthLoading = loading || authStatus === 'loading';

  useEffect(() => {
    if (isAuthLoading || isRedirectingRef.current) return;

    if (!currentUser) {
      isRedirectingRef.current = true;
      const target = `/login?next=${encodeURIComponent(pathname || '/')}`;
      router.replace(target);
      return;
    }

    if (role) {
      const activeRole = userData?.activeRole;
      const userDataRecord = userData as (UserData & { isAdmin?: boolean; role?: string }) | null;
      const hasDriverRole = activeRole === 'driver' || Boolean(userData?.roles?.driver != null);
      const hasAdminRole =
        (activeRole as string | undefined) === 'admin' ||
        Boolean(userDataRecord?.isAdmin) ||
        Boolean(userDataRecord?.role === 'admin');

      let isAllowed = false;
      if (role === 'client') {
        isAllowed = true;
      } else if (role === 'driver') {
        isAllowed = hasDriverRole || hasAdminRole;
      } else if (role === 'admin') {
        isAllowed = hasAdminRole;
      }

      if (!isAllowed) {
        isRedirectingRef.current = true;
        const target = `/login?next=${encodeURIComponent(pathname || '/')}`;
        router.replace(target);
      }
    }
  }, [isAuthLoading, currentUser, userData, role, pathname, router]);

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-slate-300">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-600/20 text-red-500 animate-pulse">
            <MaterialIcon name="local_taxi" className="text-2xl" />
          </div>
          <p className="text-sm font-medium animate-pulse">{t('auth.verifying')}</p>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  if (role) {
    const activeRole = userData?.activeRole;
    const userDataRecord = userData as (UserData & { isAdmin?: boolean; role?: string }) | null;
    const hasDriverRole = activeRole === 'driver' || Boolean(userData?.roles?.driver != null);
    const hasAdminRole =
      (activeRole as string | undefined) === 'admin' ||
      Boolean(userDataRecord?.isAdmin) ||
      Boolean(userDataRecord?.role === 'admin');

    if (role === 'driver' && !hasDriverRole && !hasAdminRole) return null;
    if (role === 'admin' && !hasAdminRole) return null;
  }

  return <>{children}</>;
}
