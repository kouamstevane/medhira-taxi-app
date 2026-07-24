'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { PersonalDriverConfigurator } from '@/app/personal-driver/components/PersonalDriverConfigurator';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';
import type { PersonalDriverPlanId } from '@/types/personal-driver';

function isPlanId(planId: string | null): planId is PersonalDriverPlanId {
  return planId === 'basic' || planId === 'classic' || planId === 'premium';
}

export default function PersonalDriverConfigurationPage() {
  const searchParams = useSearchParams();
  const selectedPlanId = searchParams.get('plan');
  const plan = PERSONAL_DRIVER_PLANS[isPlanId(selectedPlanId) ? selectedPlanId : 'basic'];

  return (
    <div className="min-h-screen bg-background pb-10 text-slate-100">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-background/80 px-4 py-4 backdrop-blur-xl">
        <Link
          href="/personal-driver"
          aria-label="Retour aux formules Personal Driver"
          className="flex size-10 items-center justify-center rounded-full bg-card text-white active:scale-95 transition-transform"
        >
          <MaterialIcon name="arrow_back" size="md" />
        </Link>
        <div>
          <p className="text-xs font-semibold text-primary">FORMULE {plan.name.toUpperCase()}</p>
          <h1 className="text-lg font-bold text-white">Configurez vos trajets</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <p className="mb-6 text-sm leading-6 text-slate-400">
          Indiquez vos deplacements reguliers pour obtenir une estimation mensuelle adaptee a votre formule.
        </p>
        <PersonalDriverConfigurator plan={plan} />
      </main>
    </div>
  );
}
