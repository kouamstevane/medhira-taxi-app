/**
 * VehicleDetailsSheet
 *
 * Bottom sheet présentant la description complète d'un type de véhicule
 * (illustration grand format, tagline, description Uber-like, points forts).
 */

'use client';

import { X, Check, Users, Clock } from 'lucide-react';
import { useEffect } from 'react';
import { CarType } from '@/types';
import { getVehicleMeta } from '@/app/taxi/data/vehicleCatalog';
import { TaxiIcon } from './TaxiIcon';

interface VehicleDetailsSheetProps {
  carType: CarType;
  onClose: () => void;
}

export function VehicleDetailsSheet({ carType, onClose }: VehicleDetailsSheetProps) {
  const meta = getVehicleMeta(carType);

  // Fermeture clavier (Escape) — confort desktop / Capacitor web view
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const backdropBg =
    meta.color === 'yellow'
      ? 'from-yellow-500/10'
      : meta.color === 'black'
      ? 'from-zinc-900/30'
      : 'from-slate-200/10';

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center sm:justify-center animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Détails du véhicule ${carType.name}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0F0F0F] w-full sm:max-w-lg sm:mx-4 rounded-t-3xl sm:rounded-2xl shadow-2xl animate-slideUp max-h-[90vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+5rem)]"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0F0F0F] border-b border-white/[0.05] px-4 sm:px-6 py-3 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl">
          <h2 className="text-lg sm:text-xl font-bold text-white">{carType.name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/10 active:bg-white/20 rounded-full transition touch-manipulation"
            style={{ minHeight: '44px', minWidth: '44px' }}
            aria-label="Fermer"
          >
            <X className="h-5 w-5 text-[#9CA3AF]" />
          </button>
        </div>

        {/* Illustration hero */}
        <div className={`relative bg-gradient-to-b ${backdropBg} to-transparent px-6 pt-6 pb-2 flex items-center justify-center`}>
          <TaxiIcon color={meta.color} className="w-56 sm:w-64 h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]" />
        </div>

        {/* Tagline + description */}
        <div className="px-4 sm:px-6 py-4 space-y-3">
          <p className="text-base sm:text-lg font-semibold text-white">{meta.tagline}</p>
          <p className="text-sm text-slate-300 leading-relaxed">{meta.description}</p>
        </div>

        {/* Caractéristiques rapides */}
        <div className="px-4 sm:px-6 pb-2 grid grid-cols-2 gap-3">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary shrink-0" />
            <div className="text-xs">
              <div className="text-slate-400">Capacité</div>
              <div className="text-white font-medium">{carType.seats} passagers</div>
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary shrink-0" />
            <div className="text-xs">
              <div className="text-slate-400">Attente</div>
              <div className="text-white font-medium">{carType.time}</div>
            </div>
          </div>
        </div>

        {/* Points forts */}
        <div className="px-4 sm:px-6 pt-4 pb-2">
          <h3 className="text-sm font-semibold text-white mb-2">Ce qui est inclus</h3>
          <ul className="space-y-2">
            {meta.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2 text-sm text-slate-300">
                <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="sticky bottom-0 bg-[#0F0F0F] border-t border-white/[0.05] px-4 sm:px-6 py-3">
          <p className="text-xs text-slate-500 text-center">
            Sélectionnez cette catégorie depuis la liste principale.
          </p>
        </div>
      </div>
    </div>
  );
}
