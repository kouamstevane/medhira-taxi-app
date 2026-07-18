'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { getDashboardRouteFor } from '@/services/roles.service';
import type { ActiveRole } from '@/types/user';

const ROLES = [
  {
    id: 'client',
    title: 'Client',
    description: 'Commandez des courses, des repas ou des colis.',
    icon: 'person',
    href: '/auth/register?role=client',
    color: 'bg-blue-500',
  },
  {
    id: 'chauffeur',
    title: 'Chauffeur / Livreur',
    description: 'Recevez des courses et gagnez de l\'argent.',
    icon: 'directions_car',
    href: '/driver/register',
    color: 'bg-orange-500',
  },
  {
    id: 'restaurateur',
    title: 'Restaurateur',
    description: 'Inscrivez votre restaurant et recevez des commandes.',
    icon: 'restaurant',
    href: '/restaurant/register',
    color: 'bg-green-500',
  },
] as const;

export default function RoleSelectionPage() {
  const router = useRouter();
  const { currentUser, userData, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (currentUser && userData) {
      if (userData.accountState === 'driver_onboarding' || userData.activeRole === 'driver_onboarding') {
        router.replace('/driver/register');
        return;
      }
      const role = (userData.lastActiveRole || userData.activeRole || 'client') as ActiveRole;
      router.replace(getDashboardRouteFor(role));
    }
  }, [currentUser, userData, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (currentUser && userData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2 text-white">Je suis…</h1>
        <p className="text-slate-400 text-center mb-8">
          Choisissez votre profil pour commencer
        </p>

        <div className="space-y-4">
          {ROLES.map((role) => (
            <Link key={role.id} href={role.href} className="block">
              <div className="glass-card p-6 rounded-2xl border border-white/5 hover:border-primary/40 hover:shadow-lg transition-all duration-200 cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-full ${role.color} flex items-center justify-center flex-shrink-0`}>
                    <MaterialIcon name={role.icon} size="lg" className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-white">{role.title}</h2>
                    <p className="text-sm text-slate-400 mt-1">{role.description}</p>
                  </div>
                  <MaterialIcon name="chevron_right" size="md" className="text-slate-500 flex-shrink-0" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <p className="text-center text-sm text-slate-400 mt-8">
          Vous avez déjà un compte ?{' '}
          <Link href="/login" className="text-primary font-semibold hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
