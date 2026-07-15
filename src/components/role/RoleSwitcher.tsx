'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

const ROLE_META: Record<ActiveRole, { label: string; icon: string }> = {
  client: { label: 'Client', icon: 'person' },
  driver: { label: 'Chauffeur', icon: 'local_taxi' },
  restaurant: { label: 'Restaurateur', icon: 'restaurant' },
};

type BadgeInfo = { text: string; color: string } | null;

function getDriverBadge(status: DriverStatus | undefined): BadgeInfo {
  if (status === 'pending') return { text: 'En attente', color: 'bg-amber-500/20 text-amber-400' };
  if (status === 'rejected') return { text: 'Refusé', color: 'bg-red-500/20 text-red-400' };
  return null;
}

function getRestaurantBadge(
  status: RestaurantStatus | undefined,
  stripeConnectStatus: StripeConnectStatus | undefined,
): BadgeInfo {
  if (status === 'suspended') return { text: 'Suspendu', color: 'bg-red-500/20 text-red-400' };
  if (stripeConnectStatus === 'restricted')
    return { text: 'Action requise', color: 'bg-red-500/20 text-red-400' };
  if (status === 'approved' && stripeConnectStatus === 'not_started')
    return { text: 'Configurez vos paiements', color: 'bg-orange-500/20 text-orange-400' };
  if (status === 'pending' || status === 'pending_approval')
    return { text: 'En attente', color: 'bg-amber-500/20 text-amber-400' };
  if (status === 'rejected') return { text: 'Refusé', color: 'bg-red-500/20 text-red-400' };
  return null;
}

export function RoleSwitcher() {
  const { userData } = useAuth();
  const statuses = useEffectiveRoleStatus();
  const { hasActiveRide } = useActiveRideGuard();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const ownedRoles: ActiveRole[] = [];
  if (userData?.roles?.client) ownedRoles.push('client');
  if (userData?.roles?.driver) ownedRoles.push('driver');
  if (userData?.roles?.restaurant) ownedRoles.push('restaurant');

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!userData || ownedRoles.length <= 1) return null;

  const activeRole = userData.activeRole;

  function getRoleBadge(role: ActiveRole): BadgeInfo {
    if (role === 'driver') return getDriverBadge(statuses.driver?.status);
    if (role === 'restaurant')
      return getRestaurantBadge(statuses.restaurant?.status, statuses.restaurant?.stripeConnectStatus);
    return null;
  }

  function isRoleDisabled(role: ActiveRole): boolean {
    if (role === 'restaurant' && statuses.restaurant?.status === 'suspended') return true;
    if (hasActiveRide && activeRole === 'driver' && role !== 'driver') return true;
    return false;
  }

  async function handleSelect(role: ActiveRole) {
    if (isRoleDisabled(role) || role === activeRole) return;
    setOpen(false);
    await setActiveRole(userData!, role);
    router.replace(
      getDashboardRouteFor(role, {
        driverStatus: statuses.driver?.status,
        restaurantStatus: statuses.restaurant?.status,
        stripeConnectStatus: statuses.restaurant?.stripeConnectStatus,
      }),
    );
  }

  const meta = ROLE_META[activeRole];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="size-11 shrink-0 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:border-primary/50 transition-colors shadow-sm shadow-primary/10 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Changer d'espace, espace actuel : ${meta.label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid="role-switcher-btn"
      >
        <MaterialIcon name={meta.icon} size="sm" className="text-primary" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-64 rounded-xl border border-white/10 bg-slate-900 py-1 shadow-xl"
          role="listbox"
          data-testid="role-dropdown"
        >
          {ownedRoles.map((role) => {
            const roleMeta = ROLE_META[role];
            const badge = getRoleBadge(role);
            const disabled = isRoleDisabled(role);
            const isActive = role === activeRole;

            return (
              <button
                key={role}
                type="button"
                role="option"
                aria-selected={isActive}
                aria-disabled={disabled}
                disabled={disabled}
                onClick={() => handleSelect(role)}
                className={[
                  'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors min-h-[44px]',
                  isActive ? 'bg-primary/10 text-primary' : 'text-white',
                  disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/5 cursor-pointer',
                ].join(' ')}
                data-testid={`role-item-${role}`}
              >
                <MaterialIcon name={roleMeta.icon} size="sm" />
                <div className="flex-1">
                  <span className="font-medium">{roleMeta.label}</span>
                  {badge && (
                    <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs ${badge.color}`}>
                      {badge.text}
                    </span>
                  )}
                </div>
                {isActive && <MaterialIcon name="check" size="sm" className="text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
