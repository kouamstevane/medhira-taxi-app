'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { ActiveRole } from '@/types/user';

type ProRoleKey = 'driver' | 'restaurant';

const PRO_ROLE_META: Record<ProRoleKey, { label: string; description: string; icon: string; href: string; color: string }> = {
  driver: {
    label: 'Devenir chauffeur',
    description: 'Transport de personnes et livraison',
    icon: 'local_taxi',
    href: '/driver/register?from=become-pro',
    color: 'bg-orange-500',
  },
  restaurant: {
    label: 'Ouvrir un restaurant',
    description: 'Vendez vos plats sur Medjira',
    icon: 'restaurant',
    href: '/restaurant/register?from=become-pro',
    color: 'bg-green-500',
  },
};

export default function BecomeProPage() {
  const router = useRouter();
  const { currentUser, userData, loading } = useAuth();

  const missingRoles = useMemo<ProRoleKey[]>(() => {
    if (!userData?.roles) return [];
    const roles: ProRoleKey[] = [];
    if (userData.roles.driver === undefined) roles.push('driver');
    if (userData.roles.restaurant === undefined) roles.push('restaurant');
    return roles;
  }, [userData]);

  useEffect(() => {
    if (loading) return;

    if (!currentUser) {
      router.replace('/login');
      return;
    }

    if (userData?.accountState === 'driver_onboarding' || userData?.activeRole === 'driver_onboarding') {
      router.replace('/driver/register');
      return;
    }

    if (userData && missingRoles.length === 0) {
      const role = (userData.lastActiveRole || userData.activeRole || 'client') as ActiveRole;
      router.replace(`/dashboard?role=${role}`);
    }
  }, [currentUser, userData, loading, missingRoles, router]);

  if (loading || !currentUser || !userData || missingRoles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2 text-white">Devenir professionnel</h1>
        <p className="text-slate-400 text-center mb-8">
          Choisissez une activit&eacute; pour commencer
        </p>

        <div className="space-y-4">
          {missingRoles.map((key) => {
            const meta = PRO_ROLE_META[key];
            return (
              <Link key={key} href={meta.href} className="block">
                <div className="glass-card p-6 rounded-2xl border border-white/5 hover:border-primary/40 hover:shadow-lg transition-all duration-200 cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-full ${meta.color} flex items-center justify-center flex-shrink-0`}>
                      <MaterialIcon name={meta.icon} size="lg" className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold text-white">{meta.label}</h2>
                      <p className="text-sm text-slate-400 mt-1">{meta.description}</p>
                    </div>
                    <MaterialIcon name="chevron_right" size="md" className="text-slate-500 flex-shrink-0" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
