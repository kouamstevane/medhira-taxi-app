/**
 * Composant FareSummary
 *
 * Résumé de l'estimation de tarif avec détails
 */

'use client';

import { CURRENCY_CODE } from '@/utils/constants';
import { formatCurrencyWithCode } from '@/utils/format';
import { useTranslation } from '@/hooks/useTranslation';

interface FareSummaryProps {
  distance: number | null;
  duration: number | null;
  price: number | null;
  loading?: boolean;
  currency?: string;
}

export const FareSummary = ({
  distance,
  duration,
  price,
  loading = false,
  currency = CURRENCY_CODE,
}: FareSummaryProps) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="bg-[#1A1A1A] p-4 rounded-lg border border-white/[0.06]">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-white/10 rounded w-3/4"></div>
          <div className="h-4 bg-white/10 rounded w-1/2"></div>
          <div className="h-8 bg-white/10 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  if (distance === null || duration === null || price === null) {
    return (
      <div className="bg-[#1A1A1A] p-4 rounded-lg border border-white/[0.06] text-center text-slate-300">
        <p>{t('taxi.selectPickupDropoffForEstimate')}</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 sm:p-5 rounded-2xl">
      <h3 className="text-sm font-semibold text-[#f29200] mb-3 uppercase tracking-wide">
        {t('taxi.fareEstimation')}
      </h3>

      <div className="space-y-2 mb-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-300">{t('common.distance')}</span>
          <span className="text-sm font-semibold text-white">{distance.toFixed(1)} km</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-300">{t('taxi.estimatedDuration')}</span>
          <span className="text-sm font-semibold text-white">{duration} min</span>
        </div>
      </div>

      <div className="border-t border-white/[0.06] pt-3 mt-3">
        <div className="flex justify-between items-center">
          <span className="text-base font-semibold text-white">{t('taxi.estimatedFare')}</span>
          <span className="text-2xl font-bold text-[#f29200]">{formatCurrencyWithCode(price)}</span>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-3">
        {t('taxi.trafficConditionsDisclaimer')}
      </p>
    </div>
  );
};

