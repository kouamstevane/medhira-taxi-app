/**
 * Composant VehicleOption
 * 
 * Option de sélection de type de véhicule (éco/confort/premium)
 */

'use client';

import { CarType } from '@/types';

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
      className={`w-full p-3 sm:p-4 border-2 rounded-lg transition-all text-left touch-manipulation ${
        disabled
          ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
          : selected
          ? 'border-[#f29200] bg-[#f29200] bg-opacity-10 active:bg-opacity-20'
          : 'border-gray-300 active:border-[#f29200] active:bg-gray-50 hover:border-[#f29200] hover:bg-gray-50'
      }`}
      style={{ minHeight: '60px' }}
    >
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base sm:text-lg text-gray-900">{carType.name}</h3>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            {carType.seats} places • {carType.time} d'attente
          </p>
          <div className="mt-2 flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm">
            <span className="text-gray-600">
              Base: <span className="font-medium text-gray-900">{carType.basePrice} FCFA</span>
            </span>
            <span className="text-gray-600">
              Par km: <span className="font-medium text-gray-900">{carType.pricePerKm} FCFA</span>
            </span>
            <span className="text-gray-600">
              Par min: <span className="font-medium text-gray-900">{carType.pricePerMinute} FCFA</span>
            </span>
          </div>
        </div>
        <div className={`ml-4 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
          selected
            ? 'border-[#f29200] bg-[#f29200]'
            : 'border-gray-300'
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

