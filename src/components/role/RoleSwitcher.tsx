'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/hooks/useAuth';
import { useEffectiveRoleStatus } from '@/hooks/useEffectiveRoleStatus';
import { useActiveRideGuard } from '@/hooks/useActiveRideGuard';
import {
  setActiveRole,
  getDashboardRouteFor,
  type DriverStatus,
  type RestaurantStatus,
  type StripeConnectStatus,
} from '@/services/roles.service';
import type { ActiveRole } from '@/types/user';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { functions } from '@/config/firebase';

type SwitchableRole = Exclude<ActiveRole, 'driver_onboarding' | 'restaurant_onboarding'>;

const ROLE_META: Record<SwitchableRole, { label: string; icon: string }> = {
  client: { label: 'Client', icon: 'person' },
  driver: { label: 'Chauffeur', icon: 'local_taxi' },
  restaurant: { label: 'Restaurateur', icon: 'restaurant' },
};

export function RoleSwitcher({ allowClientActivation = false }: { allowClientActivation?: boolean }) {
  const { userData, reloadUser } = useAuth();
  const statuses = useEffectiveRoleStatus();
  const { hasActiveRide } = useActiveRideGuard();
  const router = useRouter();
  const [switching, setSwitching] = useState<SwitchableRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (
    !userData
    || userData.activeRole === 'driver_onboarding'
    || userData.activeRole === 'restaurant_onboarding'
  ) return null;

  const profile = userData;
  const activeRole = profile.activeRole as SwitchableRole;
  const visibleRoles: SwitchableRole[] = [];
  if (profile.roles?.client || allowClientActivation) visibleRoles.push('client');
  if (profile.roles?.driver) visibleRoles.push('driver');
  if (profile.roles?.restaurant) visibleRoles.push('restaurant');

  if (visibleRoles.length <= 1) return null;

  function isRoleDisabled(role: SwitchableRole): boolean {
    if (role === 'restaurant' && statuses.restaurant?.status === 'suspended') return true;
    if (hasActiveRide && activeRole === 'driver' && role !== 'driver') return true;
    return false;
  }

  function getRoleLabel(role: SwitchableRole): string {
    const action = role === 'client' && !profile.roles?.client ? 'Activer' : 'Passer à';
    return `${action} l’espace ${ROLE_META[role].label.toLowerCase()}`;
  }

  async function handleSelect(role: SwitchableRole) {
    if (switching || role === activeRole || isRoleDisabled(role)) return;
    setSwitching(role);
    setError(null);

    try {
      if (role === 'client' && !profile.roles?.client) {
        const activateClientRole = httpsCallable<unknown, { success: boolean }>(functions, 'activateClientRole');
        await activateClientRole();
      }

      await setActiveRole(profile, role);
      await reloadUser();

      router.replace(getDashboardRouteFor(role, {
        driverStatus: statuses.driver?.status as DriverStatus | undefined,
        restaurantStatus: statuses.restaurant?.status as RestaurantStatus | undefined,
        stripeConnectStatus: statuses.restaurant?.stripeConnectStatus as StripeConnectStatus | undefined,
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Impossible de changer d’espace pour le moment.');
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div
        role="group"
        aria-label="Changer d’espace"
        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 shadow-sm"
      >
        {visibleRoles.map((role) => {
          const isActive = role === activeRole;
          const disabled = isRoleDisabled(role) || switching !== null;

          return (
            <button
              key={role}
              type="button"
              onClick={() => void handleSelect(role)}
              disabled={disabled}
              aria-label={isActive ? `${ROLE_META[role].label} actif` : getRoleLabel(role)}
              aria-pressed={isActive}
              title={isActive ? `${ROLE_META[role].label} actif` : getRoleLabel(role)}
              data-testid={`role-toggle-${role}`}
              className={[
                'flex size-10 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                isActive ? 'bg-primary text-white shadow-md shadow-primary/30' : 'text-slate-400 hover:bg-white/10 hover:text-white',
                disabled && !isActive ? 'cursor-not-allowed opacity-45' : '',
              ].join(' ')}
            >
              {switching === role ? (
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
              ) : (
                <MaterialIcon name={ROLE_META[role].icon} size="sm" />
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="max-w-56 rounded-md bg-red-500/10 px-3 py-1 text-right text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
