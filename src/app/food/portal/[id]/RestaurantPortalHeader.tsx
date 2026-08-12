'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { RoleSwitcher } from '@/components/role/RoleSwitcher';
import { AuthService } from '@/services';

interface RestaurantPortalHeaderProps {
  restaurantName: string;
}

export function RestaurantPortalHeader({ restaurantName }: RestaurantPortalHeaderProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);

    try {
      await AuthService.signOut();
      router.replace('/login');
    } catch {
      setError('Impossible de vous déconnecter. Réessayez.');
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/5 bg-background/80 px-4 py-4 backdrop-blur-xl sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <MaterialIcon name="shopping_bag" size="lg" className="text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-white">{restaurantName}</h1>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tableau de bord gérant</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <RoleSwitcher allowClientActivation />
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={signingOut}
          aria-label="Se déconnecter"
          title="Se déconnecter"
          className="flex size-10 items-center justify-center rounded-full border border-white/10 text-slate-400 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-50"
        >
          {signingOut ? (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          ) : (
            <MaterialIcon name="logout" size="sm" />
          )}
        </button>
      </div>

      {error && (
        <p role="alert" className="absolute right-4 top-full mt-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300 shadow-lg">
          {error}
        </p>
      )}
    </header>
  );
}
