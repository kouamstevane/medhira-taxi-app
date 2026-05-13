'use client';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

interface DriverPendingBannerProps {
  approvedDocs?: number;
  totalDocs?: number;
}

export function DriverPendingBanner({ approvedDocs, totalDocs }: DriverPendingBannerProps = {}) {
  const showProgress = typeof approvedDocs === 'number' && typeof totalDocs === 'number' && totalDocs > 0;
  const pct = showProgress ? Math.min(100, Math.round((approvedDocs! / totalDocs!) * 100)) : 0;

  return (
    <div role="status" className="mx-4 mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
          <MaterialIcon name="hourglass_top" className="text-amber-400 text-[22px]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-amber-400 font-bold text-sm">Candidature en cours d&apos;examen</p>
          <p className="text-slate-300 text-xs mt-0.5 leading-relaxed">
            Vos données sont en lecture seule jusqu&apos;à approbation par notre équipe.
          </p>
        </div>
      </div>

      {showProgress && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Progression du dossier</span>
            <span className="text-[11px] font-bold text-white">{approvedDocs} / {totalDocs}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-[#ffae33] transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
