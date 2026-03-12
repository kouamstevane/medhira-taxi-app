/**
 * Composant FareSummary
 *
 * Résumé de l'estimation de tarif avec détails
 */

'use client';

import { CURRENCY_CODE } from '@/utils/constants';
import { formatCurrencyWithCode } from '@/utils/format';

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
  if (loading) {
    return (
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  if (distance === null || duration === null || price === null) {
    return (
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center text-gray-500">
        <p>Sélectionnez un départ et une destination pour voir l'estimation</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-[#f29200] to-[#ffaa33] text-white p-4 sm:p-6 rounded-lg shadow-lg">
      <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Estimation de la course</h3>
      
      <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4">
        <div className="flex justify-between items-center">
          <span className="text-sm sm:text-base text-white/90">Distance</span>
          <span className="text-sm sm:text-base font-semibold">{distance.toFixed(1)} km</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm sm:text-base text-white/90">Durée estimée</span>
          <span className="text-sm sm:text-base font-semibold">{duration} min</span>
        </div>
        
        <div className="border-t border-white/30 pt-2 sm:pt-3 mt-2 sm:mt-3">
          <div className="flex justify-between items-center">
            <span className="text-base sm:text-lg font-semibold">Prix estimé</span>
            <span className="text-xl sm:text-2xl font-bold">{formatCurrencyWithCode(price)}</span>
          </div>
        </div>
      </div>
      
      <p className="text-xs text-white/80 mt-2">
        * Le prix final peut varier selon le trafic et les conditions de route
      </p>
    </div>
  );
};

