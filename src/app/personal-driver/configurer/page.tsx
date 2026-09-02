'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { PersonalDriverConfigurator } from '@/app/personal-driver/components/PersonalDriverConfigurator';
import { usePersonalDriverPlans } from '@/hooks/usePersonalDriverPlans';
import type { PersonalDriverPlanId } from '@/types/personal-driver';

function isPlanId(planId: string | null): planId is PersonalDriverPlanId {
  return planId === 'basic' || planId === 'classic' || planId === 'premium';
}

function ConfigurerContent() {
  const { plans, error, reload } = usePersonalDriverPlans();
  const searchParams = useSearchParams();
  const selectedPlanId = searchParams.get('plan');
  const plan = plans[isPlanId(selectedPlanId) ? selectedPlanId : 'basic'];

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
        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            Les forfaits par défaut restent affichés. Impossible de charger les forfaits configurés.
            <button type="button" onClick={() => void reload()} className="ml-3 font-bold underline underline-offset-4">
              Réessayer
            </button>
          </div>
        )}
        <p className="mb-6 text-sm leading-6 text-slate-400">
          Indiquez vos deplacements reguliers pour obtenir une estimation mensuelle adaptee a votre formule.
        </p>
        <PersonalDriverConfigurator plan={plan} />
      </main>
    </div>
  );
}

export default function PersonalDriverConfigurationPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Chargement...</div>}>
      <ConfigurerContent />
    </Suspense>
  );
}
