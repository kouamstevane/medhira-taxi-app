'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useEffectiveRoleStatus } from '@/hooks/useEffectiveRoleStatus';
import {
  setActiveRole,
  getDashboardRouteFor,
  type DriverStatus,
  type RestaurantStatus,
  type StripeConnectStatus,
} from '@/services/roles.service';
import type { ActiveRole } from '@/types/user';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

const ROLE_META: Record<ActiveRole, { label: string; icon: string; color: string }> = {
  client: { label: 'Espace Client', icon: 'person', color: 'bg-blue-500' },
  driver: { label: 'Espace Chauffeur', icon: 'local_taxi', color: 'bg-orange-500' },
  restaurant: { label: 'Espace Restaurateur', icon: 'restaurant', color: 'bg-green-500' },
};

type BadgeVariant = 'approved' | 'pending' | 'draft' | 'rejected' | 'suspended' | 'none';

const BADGE_LABELS: Record<string, string> = {
  approved: 'Approuvé',
  pending: 'En attente',
  pending_approval: 'En attente',
  draft: 'En attente',
  rejected: 'Refusé',
  suspended: 'Suspendu',
};

const BADGE_STYLES: Record<string, string> = {
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  pending_approval: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  draft: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  suspended: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function getBadge(
  role: ActiveRole,
  effectiveStatuses: ReturnType<typeof useEffectiveRoleStatus>,
): { variant: BadgeVariant; label: string } {
  if (role === 'client') {
    return { variant: 'none', label: '' };
  }

  if (role === 'driver' && effectiveStatuses.driver) {
    const status = effectiveStatuses.driver.status;
    return { variant: status as BadgeVariant, label: BADGE_LABELS[status] ?? status };
  }

  if (role === 'restaurant' && effectiveStatuses.restaurant) {
    const { status, stripeConnectStatus } = effectiveStatuses.restaurant;
    let label = BADGE_LABELS[status] ?? status;
    if (status === 'approved' && stripeConnectStatus !== 'active') {
      label = 'Approuvé (Stripe en attente)';
    }
    return { variant: status as BadgeVariant, label };
  }

  return { variant: 'none', label: '' };
}

export default function ContinueAsPage() {
  const router = useRouter();
  const { currentUser, userData, loading } = useAuth();
  const effectiveStatuses = useEffectiveRoleStatus();
  const [selecting, setSelecting] = useState<ActiveRole | null>(null);

  const ownedRoles: ActiveRole[] = userData
    ? (Object.keys(userData.roles) as ActiveRole[]).filter((r) => {
        if (r === 'client') return true;
        return userData.roles[r] != null;
      })
    : [];

  useEffect(() => {
    if (loading) return;
    if (!currentUser || !userData) {
      router.replace('/login');
      return;
    }
    if (ownedRoles.length <= 1) {
      const role = ownedRoles[0] ?? 'client';
      setActiveRole(userData, role).then(() => {
        router.replace(getDashboardRouteFor(role));
      });
    }
  }, [currentUser, userData, loading, ownedRoles.length, router]);

  if (loading || !userData || ownedRoles.length <= 1) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  async function handleSelect(role: ActiveRole) {
    if (!userData || selecting) return;
    setSelecting(role);
    try {
      await setActiveRole(userData, role);
      const route = getDashboardRouteFor(role, {
        driverStatus:
          role === 'driver'
            ? (effectiveStatuses.driver?.status as DriverStatus)
            : undefined,
        restaurantStatus:
          role === 'restaurant'
            ? (effectiveStatuses.restaurant?.status as RestaurantStatus)
            : undefined,
        stripeConnectStatus:
          role === 'restaurant'
            ? (effectiveStatuses.restaurant?.stripeConnectStatus as StripeConnectStatus)
            : undefined,
      });
      router.replace(route);
    } catch {
      setSelecting(null);
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="relative flex min-h-screen w-full flex-col max-w-[430px] mx-auto overflow-hidden">
        <div className="h-12 w-full" />

        <div className="flex flex-col items-center justify-center pt-8 pb-6">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
            <MaterialIcon name="swap_horiz" className="text-primary text-[40px]" />
          </div>
        </div>

        <div className="px-6 text-center">
          <h1 className="text-white text-[28px] font-bold leading-tight mb-2">
            Continuer en tant que…
          </h1>
          <p className="text-slate-400 text-base font-normal">
            Sélectionnez l&apos;espace auquel vous souhaitez accéder
          </p>
        </div>

        <div className="px-6 mt-8 space-y-3">
          {ownedRoles.map((role) => {
            const meta = ROLE_META[role];
            const badge = getBadge(role, effectiveStatuses);
            const isLoading = selecting === role;

            return (
              <button
                key={role}
                type="button"
                onClick={() => handleSelect(role)}
                disabled={selecting !== null}
                className="glass-card w-full p-5 rounded-2xl border border-white/5 hover:border-primary/40 hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-left"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-full ${meta.color} flex items-center justify-center flex-shrink-0`}
                  >
                    <MaterialIcon name={meta.icon} size="lg" className="text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-white">{meta.label}</h2>
                    {badge.variant !== 'none' && (
                      <span
                        className={`inline-block mt-1 px-2.5 py-0.5 text-xs font-medium rounded-full border ${
                          BADGE_STYLES[badge.variant] ?? ''
                        }`}
                      >
                        {badge.label}
                      </span>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <MaterialIcon
                        name="chevron_right"
                        size="md"
                        className="text-slate-500"
                      />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
