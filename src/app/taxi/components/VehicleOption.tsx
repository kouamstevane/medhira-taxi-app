/**
 * Composant VehicleOption
 *
 * Option de sélection de type de véhicule (Eco / Confort / Confort+).
 * Affiche une illustration de la voiture aux couleurs de la catégorie
 * et un bouton d'info qui ouvre la description détaillée.
 */

'use client';

import { Info } from 'lucide-react';
import { CarType } from '@/types';
import { getVehicleMeta } from '@/app/taxi/data/vehicleCatalog';
import { TaxiIcon } from './TaxiIcon';

interface VehicleOptionProps {
  carType: CarType;
  selected: boolean;
  onSelect: (carType: CarType) => void;
  onShowDetails?: (carType: CarType) => void;
  estimatedPrice?: number | null;
  disabled?: boolean;
}

export const VehicleOption = ({
  carType,
  selected,
  onSelect,
  onShowDetails,
  estimatedPrice = null,
  disabled = false,
}: VehicleOptionProps) => {
  const meta = getVehicleMeta(carType);

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

      <div className="relative flex items-center gap-3 sm:gap-4">
        {/* Illustration taxi */}
        <div className="shrink-0 w-20 sm:w-24 -my-1">
          <TaxiIcon color={meta.color} className="w-full h-auto" />
        </div>

        {/* Détails */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold text-base sm:text-lg ${selected ? 'text-primary' : 'text-white'}`}>
              {carType.name}
            </h3>
            {onShowDetails && !disabled && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Voir la description de ${carType.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onShowDetails(carType);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onShowDetails(carType);
                  }
                }}
                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:text-primary hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <Info className="w-4 h-4" />
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5 line-clamp-1">
            {meta.tagline}
          </p>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-1">
            {carType.seats} places • {carType.time} d&apos;attente
          </p>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
            {estimatedPrice != null ? (
              <>
                Prix estimé <span className="font-medium text-slate-100">{estimatedPrice} CAD</span>
              </>
            ) : (
              'Prix estimé disponible après saisie du trajet'
            )}
          </p>
        </div>

        {/* Indicateur sélection */}
        <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
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
