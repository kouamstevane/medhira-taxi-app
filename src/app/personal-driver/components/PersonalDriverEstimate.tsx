'use client';

import { useState } from 'react';
import type { PersonalDriverConfiguration } from './PersonalDriverConfigurator';
import { usePersonalDriverPlans } from '@/hooks/usePersonalDriverPlans';
import { useTranslation } from '@/hooks/useTranslation';
import {
  calculatePersonalDriverPrices,
  formatPersonalDriverCurrency,
} from '@/services/personal-driver/pricing.service';
import type { PersonalDriverPlanId } from '@/types/personal-driver';

export const PERSONAL_DRIVER_ESTIMATE_SESSION_KEY = 'medjira.personalDriver.estimate.v1';

interface PersonalDriverEstimateProps {
  configuration: PersonalDriverConfiguration;
  onContinue: (planId: PersonalDriverPlanId) => void;
}

const planIds: PersonalDriverPlanId[] = ['basic', 'classic', 'premium'];

function formatKm(distanceKm: number, locale: string): string {
  const numLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  return distanceKm.toLocaleString(numLocale, { maximumFractionDigits: 1 });
}

export function PersonalDriverEstimate({ configuration, onContinue }: PersonalDriverEstimateProps) {
  const { t, locale } = useTranslation();
  const numLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  const { plans, error, reload } = usePersonalDriverPlans();
  const comparison = calculatePersonalDriverPrices({
    monthlyDistanceKm: configuration.monthlyDistanceKm,
    requestedWeekdays: configuration.weekdays,
  }, plans);
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

  const recommendedPlanName = plans[comparison.recommendedPlanId]?.name ?? '';
  const recommendationText = t('personalDriver.recommendedRateNotice', { plan: recommendedPlanName });

  return (
    <div className="space-y-6">
      <section aria-label={t('personalDriver.tripSummaryTitle')} className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
        {error && (
          <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100">
            {t('personalDriver.fallbackNotice')}
            <button type="button" onClick={() => void reload()} className="ml-3 font-bold underline underline-offset-4">
              {t('personalDriver.retry')}
            </button>
          </p>
        )}
        <p><span className="font-semibold text-white">{t('personalDriver.initialPlanLabel')}</span> {plans[configuration.planId].name}</p>
        <p><span className="font-semibold text-white">{t('personalDriver.outwardLabel')}</span> {formatKm(configuration.distanceOneWayKm, locale)} km</p>
        {configuration.tripType === 'round_trip' && configuration.distanceReturnKm !== undefined && (
          <p><span className="font-semibold text-white">{t('personalDriver.returnLabel')}</span> {formatKm(configuration.distanceReturnKm, locale)} km</p>
        )}
        <p><span className="font-semibold text-white">{t('personalDriver.monthlyDistanceLabel')}</span> {formatKm(configuration.monthlyDistanceKm, locale)} km</p>
      </section>

      <section aria-labelledby="estimate-heading">
        <div className="mb-4">
          <p className="text-sm font-semibold text-primary">{t('personalDriver.yourEstimateBadge')}</p>
          <h2 id="estimate-heading" className="text-2xl font-bold text-white">{t('personalDriver.chooseYourPlanTitle')}</h2>
          <p className="mt-1 text-sm text-slate-400">{t('personalDriver.indicativeEstimateText')}</p>
        </div>
        <p className="mb-4 text-sm text-slate-400">{recommendationText}</p>

        <fieldset className="space-y-3">
          <legend className="sr-only">{t('personalDriver.availablePlansLegend')}</legend>
          {planIds.map((planId) => {
            const plan = plans[planId];
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
                    aria-label={t('screens.personalDriverPlan.choose', { name: plan.name })}
                    checked={selectedPlanId === planId}
                    disabled={!price.isEligible}
                    onChange={() => setSelectedPlanId(planId)}
                    className="mt-1 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-lg font-bold text-white">{plan.name}</h2>
                      {isRecommended && <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">{t('personalDriver.recommendedBadge')}</span>}
                    </div>
                    <p className="mt-1 text-xl font-bold text-white">
                      {formatPersonalDriverCurrency(price.totalBeforeTax, undefined, numLocale)}{' '}
                      <span className="text-sm font-medium text-slate-400">{t('personalDriver.perMonth')}</span>
                    </p>
                    {!price.isEligible && <p className="mt-2 text-sm text-amber-300">{t('personalDriver.notCoveredDays')}</p>}
                    {price.minimumApplied && (
                      <p className="mt-2 text-sm text-slate-400">
                        {t('personalDriver.minimumAppliedNotice', { km: formatKm(price.minimumBillableKm, locale) })}
                      </p>
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
        className="min-h-12 w-full rounded-lg bg-primary px-4 text-sm font-bold text-black transition active:scale-[0.98]"
      >
        {t('personalDriver.continueWithPlan')}
      </button>
      <a href={`/personal-driver/configurer?plan=${configuration.planId}`} className="block text-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
        {t('personalDriver.editMyTrip')}
      </a>
    </div>
  );
}
