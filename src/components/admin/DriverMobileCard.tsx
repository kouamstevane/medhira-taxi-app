'use client';

import React from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import type { Driver } from '@/app/admin/drivers/page';

export interface DriverMobileCardProps {
  driver: Driver;
  onSelect: (driver: Driver) => void;
  statusBadge: React.ReactNode;
}

export function DriverMobileCard({ driver, onSelect, statusBadge }: DriverMobileCardProps) {
  const initials = `${(driver.firstName || 'U').charAt(0).toUpperCase()}${(driver.lastName || '').charAt(0).toUpperCase()}`;
  const fullName = `${driver.firstName || 'Utilisateur'} ${driver.lastName || ''}`.trim();
  const carModel = driver.car?.model || driver.carModel;
  const carPlate = driver.car?.plate || driver.carPlate;
  const carColor = driver.car?.color || driver.carColor;

  return (
    <button
      type="button"
      onClick={() => onSelect(driver)}
      className="group relative flex w-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left shadow-sm transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[44px]"
      aria-label={`Détails du chauffeur ${fullName}`}
    >
      {/* Top row: Avatar, Name & Status */}
      <div className="flex items-start justify-between gap-3 w-full">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-sm font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-white group-hover:text-primary transition-colors">
              {fullName}
            </h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  driver.driverType === 'livreur'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : driver.driverType === 'les_deux'
                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                    : 'bg-primary/10 text-primary border border-primary/20'
                }`}
              >
                {driver.driverType === 'livreur'
                  ? 'Livreur'
                  : driver.driverType === 'les_deux'
                  ? 'Les deux'
                  : 'Chauffeur'}
              </span>
              {driver.licenseNumber && (
                <span className="truncate text-[11px] text-slate-500">
                  Permis : {driver.licenseNumber}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1">
          {statusBadge}
          {driver.isSuspended && (
            <span className="flex items-center gap-1 rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-tighter text-orange-400">
              <span className="h-1 w-1 rounded-full bg-orange-400 animate-pulse" />
              Suspendu
            </span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px w-full bg-white/5" />

      {/* Bottom row: Vehicle, Contact summary & Chevron */}
      <div className="flex items-center justify-between text-xs text-slate-400 w-full">
        <div className="flex items-center gap-2 min-w-0">
          <MaterialIcon name="directions_car" size="sm" className="text-primary shrink-0" />
          <span className="truncate text-slate-300 font-medium text-xs">
            {carModel || 'Véhicule non renseigné'}
          </span>
          {carPlate && (
            <span className="truncate text-[11px] text-slate-500 uppercase">
              • {carPlate} {carColor ? `(${carColor})` : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-500 group-hover:text-white transition-colors pl-2">
          <span className="text-[11px]">Détails</span>
          <MaterialIcon name="chevron_right" size="sm" />
        </div>
      </div>
    </button>
  );
}

export default DriverMobileCard;
