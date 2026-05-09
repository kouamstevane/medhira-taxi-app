'use client';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

export function DriverPendingBanner() {
  return (
    <div role="status" className="sticky top-0 z-40 bg-amber-500/15 border-b border-amber-500/40 px-4 py-3 flex items-center gap-3">
      <MaterialIcon name="hourglass_top" className="text-amber-400" />
      <div>
        <p className="text-white font-semibold text-sm">Candidature en cours d&apos;examen</p>
        <p className="text-slate-300 text-xs">Vos données sont en lecture seule jusqu&apos;à approbation.</p>
      </div>
    </div>
  );
}
