'use client';

import { useState } from 'react';
import type { PersonalDriverConfiguration } from './PersonalDriverConfigurator';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';
import { calculatePersonalDriverPrices } from '@/services/personal-driver/pricing.service';
import type { PersonalDriverPlanId } from '@/types/personal-driver';

export const PERSONAL_DRIVER_ESTIMATE_SESSION_KEY = 'medjira.personalDriver.estimate.v1';

interface PersonalDriverEstimateProps {
  configuration: PersonalDriverConfiguration;
  onContinue: (planId: PersonalDriverPlanId) => void;
}

const planIds: PersonalDriverPlanId[] = ['basic', 'classic', 'premium'];

function formatKm(distanceKm: number): string {
  return distanceKm.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

function formatCad(amount: number): string {
  return `${amount.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} CAD`;
}

export function PersonalDriverEstimate({ configuration, onContinue }: PersonalDriverEstimateProps) {
  const comparison = calculatePersonalDriverPrices({
    monthlyDistanceKm: configuration.monthlyDistanceKm,
    requestedWeekdays: configuration.weekdays,
  });
  const [selectedPlanId, setSelectedPlanId] = useState<PersonalDriverPlanId>(
    comparison.plans[configuration.planId].isEligible ? configuration.planId : comparison.recommendedPlanId,
  );

  const handleContinue = () => {
    const selectedPlan = comparison.plans[selectedPlanId];
    sessionStorage.setItem(
      PERSONAL_DRIVER_ESTIMATE_SESSION_KEY,
      JSON.stringify({
        version: 1,
        requestId: configuration.requestId,
        selectedPlanId,
        recommendedPlanId: comparison.recommendedPlanId,
        monthlyDistanceKm: comparison.monthlyDistanceKm,
        selectedPlan,
        comparison,
        configuration,
      }),
    );
    onContinue(selectedPlanId);
  };

  return (
    <div className="space-y-6">
      <section aria-label="Resume du trajet" className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
        <p><span className="font-semibold text-white">Forfait initial :</span> {PERSONAL_DRIVER_PLANS[configuration.planId].name}</p>
        <p><span className="font-semibold text-white">Aller :</span> {formatKm(configuration.distanceOneWayKm)} km</p>
        {configuration.tripType === 'round_trip' && configuration.distanceReturnKm !== undefined && (
          <p><span className="font-semibold text-white">Retour :</span> {formatKm(configuration.distanceReturnKm)} km</p>
        )}
        <p><span className="font-semibold text-white">Distance mensuelle :</span> {formatKm(configuration.monthlyDistanceKm)} km</p>
      </section>

      <section aria-labelledby="estimate-heading">
        <div className="mb-4">
          <p className="text-sm font-semibold text-primary">VOTRE ESTIMATION</p>
          <h1 id="estimate-heading" className="text-2xl font-bold text-white">Choisissez votre forfait</h1>
        </div>
        <p className="mb-4 text-sm text-slate-400">{comparison.recommendationReasons.join(' ')}</p>

        <fieldset className="space-y-3">
          <legend className="sr-only">Forfaits disponibles</legend>
          {planIds.map((planId) => {
            const plan = PERSONAL_DRIVER_PLANS[planId];
            const price = comparison.plans[planId];
            const isRecommended = planId === comparison.recommendedPlanId;

            return (
              <label
                key={planId}
                className={`block rounded-lg border p-4 transition ${
                  selectedPlanId === planId ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'
                } ${price.isEligible ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="personal-driver-plan"
                    aria-label={`Choisir ${plan.name}`}
                    checked={selectedPlanId === planId}
                    disabled={!price.isEligible}
                    onChange={() => setSelectedPlanId(planId)}
                    className="mt-1 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-lg font-bold text-white">{plan.name}</h2>
                      {isRecommended && <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">Recommande</span>}
                    </div>
                    <p className="mt-1 text-xl font-bold text-white">{formatCad(price.totalBeforeTax)} <span className="text-sm font-medium text-slate-400">/ mois</span></p>
                    {!price.isEligible && <p className="mt-2 text-sm text-amber-300">Ce forfait ne couvre pas tous les jours choisis.</p>}
                    {price.minimumApplied && (
                      <p className="mt-2 text-sm text-slate-400">Le minimum de {formatKm(price.minimumBillableKm)} km est applique pour ce forfait.</p>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </fieldset>
      </section>

      <button
        type="button"
        onClick={handleContinue}
        className="min-h-12 w-full rounded-lg bg-primary px-4 text-sm font-bold text-white transition active:scale-[0.98]"
      >
        Continuer avec ce forfait
      </button>
      <a href="/personal-driver/configurer?plan=classic" className="block text-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
        Modifier mon trajet
      </a>
    </div>
  );
}
