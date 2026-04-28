/**
 * Composant VehicleOption
 *
 * Option de sélection de type de véhicule (éco/confort/premium)
 */

'use client';

import { CarType } from '@/types';
import { CURRENCY_CODE } from '@/utils/constants';

interface VehicleOptionProps {
  carType: CarType;
  selected: boolean;
  onSelect: (carType: CarType) => void;
  disabled?: boolean;
}

export const VehicleOption = ({ carType, selected, onSelect, disabled = false }: VehicleOptionProps) => {
  return (
    <button
      type="button"
      onClick={() => !disabled && onSelect(carType)}
      disabled={disabled}
      className={`relative w-full overflow-hidden p-4 border rounded-2xl transition-all text-left touch-manipulation ${
        disabled
          ? 'border-white/[0.04] bg-[#1A1A1A]/50 cursor-not-allowed opacity-60'
          : selected
          ? 'border-primary/40 bg-primary/[0.08] active:bg-primary/[0.12] shadow-[0_0_24px_-8px_rgba(242,146,0,0.4)]'
          : 'border-white/[0.08] glass-card active:border-primary/30 hover:border-primary/30 hover:bg-white/[0.03]'
      }`}
      style={{ minHeight: '60px' }}
    >
      {selected && !disabled && (
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/20 blur-3xl rounded-full pointer-events-none" />
      )}

      <div className="relative flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold text-base sm:text-lg ${selected ? 'text-primary' : 'text-white'}`}>
            {carType.name}
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {carType.seats} places • {carType.time} d&apos;attente
          </p>
          <div className="mt-2 flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm">
            <span className="text-slate-500">
              Base: <span className="font-medium text-slate-200">{carType.basePrice} {CURRENCY_CODE}</span>
            </span>
            <span className="text-slate-500">
              Par km: <span className="font-medium text-slate-200">{carType.pricePerKm} {CURRENCY_CODE}</span>
            </span>
            <span className="text-slate-500">
              Par min: <span className="font-medium text-slate-200">{carType.pricePerMinute} {CURRENCY_CODE}</span>
            </span>
          </div>
        </div>
        <div className={`ml-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
          selected
            ? 'border-primary bg-primary'
            : 'border-white/20'
        }`}>
          {selected && (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
};

