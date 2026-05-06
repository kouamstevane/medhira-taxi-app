'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

export function BecomeProCard() {
  const { userData } = useAuth();
  const hasDriver = userData?.roles?.driver != null;
  const hasRestaurant = userData?.roles?.restaurant != null;
  if (hasDriver && hasRestaurant) return null;

  if (!hasDriver && !hasRestaurant) {
    return (
      <Link
        href="/auth/become-pro"
        className="block glass-card p-4 rounded-xl hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-lg">
            <MaterialIcon name="rocket_launch" className="text-primary" />
          </div>
          <div>
            <p className="text-white font-semibold">Devenir professionnel</p>
            <p className="text-slate-400 text-sm">Chauffeur ou restaurateur</p>
          </div>
        </div>
      </Link>
    );
  }
  if (!hasDriver) {
    return (
      <Link
        href="/driver/register?from=become-pro"
        className="block glass-card p-4 rounded-xl hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-lg">
            <MaterialIcon name="local_taxi" className="text-primary" />
          </div>
          <div>
            <p className="text-white font-semibold">Devenir chauffeur</p>
            <p className="text-slate-400 text-sm">Transport de personnes</p>
          </div>
        </div>
      </Link>
    );
  }
  return (
    <Link
      href="/restaurant/register?from=become-pro"
      className="block glass-card p-4 rounded-xl hover:bg-white/5 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2.5 rounded-lg">
          <MaterialIcon name="restaurant" className="text-primary" />
        </div>
        <div>
          <p className="text-white font-semibold">Ouvrir un restaurant</p>
          <p className="text-slate-400 text-sm">Vendez vos plats sur Medjira</p>
        </div>
      </div>
    </Link>
  );
}
