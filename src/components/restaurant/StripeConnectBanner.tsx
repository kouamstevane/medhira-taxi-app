'use client';

import Link from 'next/link';
import type { StripeConnectStatus } from '@/services/roles.service';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

type Props = { status: StripeConnectStatus };

export function StripeConnectBanner({ status }: Props) {
  if (status === 'active') return null;

  if (status === 'not_started') {
    return (
      <div role="status" className="rounded-lg bg-orange-500/15 border border-orange-500/40 p-4 flex items-center gap-3">
        <MaterialIcon name="payments" className="text-orange-400" />
        <div className="flex-1">
          <p className="text-white font-semibold">Configurez vos paiements</p>
          <p className="text-slate-300 text-sm">Pour recevoir vos premières commandes, finalisez votre compte Stripe.</p>
        </div>
        <Link href="/restaurant/onboarding/payments" className="bg-orange-500 text-white rounded-md px-4 py-2 text-sm font-semibold">Configurer</Link>
      </div>
    );
  }

  if (status === 'in_progress') {
    return (
      <div role="status" className="rounded-lg bg-blue-500/15 border border-blue-500/40 p-4 flex items-center gap-3">
        <MaterialIcon name="hourglass_top" className="text-blue-400" />
        <div className="flex-1">
          <p className="text-white font-semibold">Onboarding Stripe en cours</p>
          <p className="text-slate-300 text-sm">Reprenez là où vous vous êtes arrêté pour activer les paiements.</p>
        </div>
        <Link href="/restaurant/onboarding/payments" className="bg-blue-500 text-white rounded-md px-4 py-2 text-sm font-semibold">Reprendre</Link>
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-lg bg-red-500/15 border border-red-500/40 p-4 flex items-center gap-3">
      <MaterialIcon name="error" className="text-red-400" />
      <div className="flex-1">
        <p className="text-white font-semibold">Action requise sur votre compte Stripe</p>
        <p className="text-slate-300 text-sm">Stripe demande des informations supplémentaires pour réactiver les paiements.</p>
      </div>
      <Link href="/restaurant/onboarding/payments?mode=update" className="bg-red-500 text-white rounded-md px-4 py-2 text-sm font-semibold">Réparer</Link>
    </div>
  );
}
